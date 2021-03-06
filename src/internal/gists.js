import { getGithubRessource, postGithubRessource, patchGithubRessource } from "./github-rest.js"

export const getGist = (gistId, options) =>
  getGithubRessource(`https://api.github.com/gists/${gistId}`, options)

// https://developer.github.com/v3/gists/#create-a-gist
export const postGist = ({ files = {}, description, secret = false }, options) =>
  postGithubRessource(
    `https://api.github.com/gists`,
    { files, description, public: !secret },
    options,
  )

export const patchGist = (gistId, gist, options) =>
  patchGithubRessource(`https://api.github.com/gists/${gistId}`, gist, options)
