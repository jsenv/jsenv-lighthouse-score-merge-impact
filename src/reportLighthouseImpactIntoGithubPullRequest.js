/* eslint-disable import/max-dependencies */

import { createOperation } from "@jsenv/cancellation"
import { createLogger } from "@jsenv/logger"
import {
  wrapExternalFunction,
  createCancellationTokenForProcess,
  assertAndNormalizeDirectoryUrl,
} from "@jsenv/util"
import { exec } from "./internal/exec.js"
import { getGist, postGist, patchGist } from "./internal/gists.js"
import {
  getPullRequest,
  getPullRequestCommentMatching,
  patchPullRequestComment,
  postPullRequestComment,
} from "./internal/pull-requests.js"
import { generateCommentBody } from "./internal/generateCommentBody.js"

export const reportLighthouseImpactIntoGithubPullRequest = async (
  generateLighthouseReport,
  {
    cancellationToken = createCancellationTokenForProcess(),
    logLevel,
    projectDirectoryUrl,
    repositoryOwner,
    repositoryName,
    pullRequestNumber,
    githubToken,
    githubTokenForGist = githubToken,
    githubTokenForComment = githubToken,
  },
) => {
  return wrapExternalFunction(
    async () => {
      const logger = createLogger({ logLevel })
      projectDirectoryUrl = assertAndNormalizeDirectoryUrl(projectDirectoryUrl)

      const execCommandInProjectDirectory = (command) => exec(command, { cwd: projectDirectoryUrl })

      if (typeof githubTokenForGist !== "string") {
        throw new TypeError(
          `githubTokenForGist must be a string but received ${githubTokenForGist}`,
        )
      }
      if (typeof githubTokenForComment !== "string") {
        throw new TypeError(
          `githubTokenForComment must be a string but received ${githubTokenForComment}`,
        )
      }

      const pullRequest = await getPullRequest(
        { repositoryOwner, repositoryName, pullRequestNumber },
        { cancellationToken },
      )
      // here we could detect fork and so on
      const pullRequestBase = pullRequest.base.ref
      const pullRequestHead = pullRequest.head.ref

      await execCommandInProjectDirectory(
        `git fetch --no-tags --prune --depth=1 origin ${pullRequestBase}`,
      )
      await execCommandInProjectDirectory(`git checkout origin/${pullRequestBase}`)
      await execCommandInProjectDirectory(`npm install`)

      const baseReport = await generateLighthouseReport()

      await execCommandInProjectDirectory(`git fetch --no-tags --prune origin ${pullRequestHead}`)
      await execCommandInProjectDirectory(`git merge FETCH_HEAD`)
      await execCommandInProjectDirectory(`npm install`)

      const headReport = await generateLighthouseReport()

      logger.debug(
        `searching lighthouse comment in pull request ${getPullRequestUrl({
          repositoryOwner,
          repositoryName,
          pullRequestNumber,
        })}`,
      )
      const existingComment = await createOperation({
        cancellationToken,
        start: () =>
          getPullRequestCommentMatching(
            ({ body }) =>
              body.match(/<!-- Generated by @jsenv\/github-pull-request-lighthouse-impact -->/),
            {
              githubToken,
              repositoryOwner,
              repositoryName,
              pullRequestNumber,
            },
          ),
      })

      const baseGistData = {
        files: {
          [`${repositoryOwner}-${repositoryName}-pr-${pullRequestNumber}-base-lighthouse-report.json`]: {
            content: JSON.stringify(baseReport),
          },
        },
      }
      const headGistData = {
        files: {
          [`${repositoryOwner}-${repositoryName}-pr-${pullRequestNumber}-merged-lighthouse-report.json`]: {
            content: JSON.stringify(headReport),
          },
        },
      }

      if (existingComment) {
        logger.debug(`comment found at ${commentToUrl(existingComment)}.`)

        const gistIds = commentToGistIds(existingComment)
        if (!gistIds) {
          logger.error(`cannot find gist id in comment body
--- comment body ---
${existingComment.body}`)
          return null
        }
        const { baseGistId, headGistId } = gistIds
        logger.debug(`gist found
--- gist for base lighthouse report ---
${gistIdToUrl(baseGistId)}
--- gist for head lighthouse report ---
${gistIdToUrl(headGistId)}`)

        logger.debug(`update or create both gists.`)
        let [baseGist, headGist] = await Promise.all([
          getGist(baseGistId, { githubToken }),
          getGist(headGistId, { githubToken }),
        ])
        if (baseGist) {
          logger.debug("base gist found, updating it")
          baseGist = await patchGist(baseGist.id, baseGistData, { githubToken })
        } else {
          logger.debug(`base gist not found, creating it`)
          baseGist = await postGist(baseGistData, { githubToken })
        }
        if (headGist) {
          logger.debug("head gist found, updating it")
          headGist = await patchGist(headGist.id, headGistData, { githubToken })
        } else {
          logger.debug(`head gist not found, creating it`)
          headGist = await postGist(headGistData, { githubToken })
        }

        logger.debug(`updating comment at ${commentToUrl(existingComment)}`)
        const commentId = comment.id
        const comment = await patchPullRequestComment(
          commentId,
          generateCommentBody({
            baseReport,
            headReport,
            baseGist,
            headGist,
            pullRequestBase,
            pullRequestHead,
          }),
          {
            repositoryOwner,
            repositoryName,
            pullRequestNumber,
          },
          {
            githubToken,
          },
        )
        logger.log("comment updated")

        return {
          baseGist,
          headGist,
          comment,
        }
      }

      logger.debug(`comment not found`)

      logger.debug(`creating base and head gist`)
      const [baseGist, headGist] = await Promise.all([
        postGist(baseGistData, { githubToken }),
        postGist(headGistData, { githubToken }),
      ])
      logger.debug(`gist created.
--- gist for base lighthouse report ---
${gistToUrl(baseGist)}
--- gist for head lighthouse report ---
${gistToUrl(headGist)}`)

      logger.debug(`creating comment`)
      const comment = await postPullRequestComment(
        generateCommentBody({
          baseReport,
          headReport,
          baseGist,
          headGist,
          pullRequestBase,
          pullRequestHead,
        }),
        {
          repositoryOwner,
          repositoryName,
          pullRequestNumber,
        },
        {
          githubToken,
        },
      )
      logger.debug(`comment created at ${commentToUrl(comment)}`)

      return {
        baseGist,
        headGist,
        comment,
      }
    },
    { catchCancellation: true, unhandledRejectionStrict: true },
  )
}

const baseGistIdRegex = new RegExp("<!-- base-gist-id=([a-zA-Z0-9_]+) -->")
const headGistIdRegex = new RegExp("<!-- head-gist-id=([a-zA-Z0-9_]+) -->")

const commentToGistIds = (comment) => {
  const baseGistId = comment.body.match(baseGistIdRegex)[1]
  if (!baseGistId) return null
  const headGistId = comment.body.match(headGistIdRegex)[1]
  if (!headGistId) return null
  return { baseGistId, headGistId }
}

const commentToUrl = (comment) => {
  return comment.html_url
}

const gistIdToUrl = (gistId) => {
  return `https://gist.github.com/${gistId}`
}

const gistToUrl = (gist) => {
  return gist.html_url
}

const getPullRequestUrl = ({ repositoryOwner, repositoryName, pullRequestNumber }) =>
  `https://github.com/${repositoryOwner}/${repositoryName}/pull/${pullRequestNumber}`
