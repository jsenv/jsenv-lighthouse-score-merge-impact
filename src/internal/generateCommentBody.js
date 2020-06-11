/*

*/

import { formatNumericDiff } from "./formatNumericDiff.js"

export const GENERATED_BY_COMMENT = "`<!-- Generated by @jsenv/lighthouse-score-merge-impact -->"

export const generateCommentBody = ({
  headerMessages = [],
  baseReport,
  headReport,
  baseGist,
  headGist,
  pullRequestBase,
  pullRequestHead,
}) => {
  const baseVersion = baseReport.lighthouseVersion
  const headVersion = headReport.lighthouseVersion
  let impactAnalysisEnabled = true
  if (baseVersion !== headVersion) {
    impactAnalysisEnabled = false
    headerMessages.push(
      `**Warning:** Impact analysis skipped because lighthouse version are different on \`${pullRequestBase}\` (${baseVersion}) and \`${pullRequestHead}\` (${headVersion}).`,
    )
  }

  return `${GENERATED_BY_COMMENT}
${baseGist ? `<!-- base-gist-id=${baseGist.id} -->` : ``}
${headGist ? `<!-- head-gist-id=${headGist.id} -->` : ``}
<h3>Lighthouse merge impact</h3>

${renderHeader(headerMessages)}
${
  impactAnalysisEnabled
    ? renderBody({ baseReport, headReport, pullRequestBase, pullRequestHead })
    : ""
}
${renderFooter({ baseGist, headGist, pullRequestBase, pullRequestHead })}`
}

const renderHeader = (headerMessages) => {
  if (headerMessages.length === 0) {
    return ""
  }

  return `---

${headerMessages.join(`

`)}

---`
}

const renderBody = ({ baseReport, headReport, pullRequestBase, pullRequestHead }) => {
  return Object.keys(baseReport.categories).map((categoryName) => {
    return renderCategory(categoryName, {
      baseReport,
      headReport,
      pullRequestBase,
      pullRequestHead,
    })
  }).join(`

`)
}

const renderCategory = (category, { baseReport, headReport, pullRequestBase, pullRequestHead }) => {
  const baseScore = scoreToDisplayedScore(baseReport.categories[category].score)
  const headScore = scoreToDisplayedScore(headReport.categories[category].score)
  const diffScore = formatNumericDiff(headScore - baseScore)

  return `<details>
  <summary>${category} (${diffScore})</summary>
  ${renderCategoryScore(category, { baseReport, headReport, pullRequestBase, pullRequestHead })}
  ${renderCategoryAudits(category, {
    baseReport,
    headReport,
    pullRequestBase,
    pullRequestHead,
  })}
</details>`
}

const scoreToDisplayedScore = (score) => twoDecimalsPrecision(score)

const twoDecimalsPrecision = (floatingNumber) => Math.round(floatingNumber * 100) / 100

const renderCategoryScore = (
  category,
  { baseReport, headReport, pullRequestBase, pullRequestHead },
) => {
  const headerCells = [
    `<th nowrap>Impact</th>`,
    `<th nowrap>${pullRequestBase}</th>`,
    `<th nowrap>${pullRequestHead}</th>`,
  ]
  const baseScore = scoreToDisplayedScore(baseReport.categories[category].score)
  const headScore = scoreToDisplayedScore(headReport.categories[category].score)
  const bodyCells = [
    `<td nowrap>${formatNumericDiff(headScore - baseScore)}</td>`,
    `<td nowrap>${baseScore}</td>`,
    `<td nowrap>${headScore}</td>`,
  ]

  return `<h3>Global impact on ${category}</h3>
  <table>
    <thead>
      <tr>
        ${headerCells.join(`
        `)}
      </tr>
    </thead>
    <tbody>
      <tr>
        ${bodyCells.join(`
        `)}
      </tr>
    </tbody>
  </table>`
}

const renderCategoryAudits = (
  category,
  { baseReport, headReport, pullRequestBase, pullRequestHead },
) => {
  const impactedAuditsHeaderCells = [
    `<th nowrap>Audit</th>`,
    `<th nowrap>Impact</th>`,
    `<th nowrap>${pullRequestBase}</th>`,
    `<th nowrap>${pullRequestHead}</th>`,
  ]
  const { auditRefs } = baseReport.categories[category]

  const impactedAudits = []

  auditRefs.forEach((auditRef) => {
    const auditId = auditRef.id
    const baseAudit = baseReport.audits[auditId]
    const headAudit = headReport.audits[auditId]

    const { scoreDisplayMode } = baseAudit

    // manual checks cannot be compared
    // and there is definitely no use to display them
    if (scoreDisplayMode === "manual") {
      return
    }

    // informative audit will mostly be skipped
    if (scoreDisplayMode === "informative") {
      const baseNumericValue = baseAudit.numericValue
      const baseDisplayValue = baseAudit.displayValue
      const headNumericValue = headAudit.numericValue
      const headDisplayValue = headAudit.displayValue

      if (typeof baseNumericValue !== "undefined") {
        impactedAudits.push([
          `<td nowrap>${auditId}</td>`,
          `<td nowrap>${baseNumericValue === headNumericValue ? "none" : "---"}</td>`,
          `<td nowrap>${
            typeof baseDisplayValue === "undefined" ? baseNumericValue : baseDisplayValue
          }</td>`,
          `<td nowrap>${
            typeof headDisplayValue === "undefined" ? headNumericValue : headDisplayValue
          }</td>`,
        ])
        return
      }
      if (typeof baseDisplayValue !== "undefined") {
        impactedAudits.push([
          `<td nowrap>${auditId}</td>`,
          `<td nowrap>${baseDisplayValue === headDisplayValue ? "none" : "---"}</td>`,
          `<td nowrap>${baseDisplayValue}</td>`,
          `<td nowrap>${headDisplayValue}</td>`,
        ])
        return
      }
      return
    }

    if (scoreDisplayMode === "binary") {
      const baseScore = baseAudit.score
      const headScore = headAudit.score

      if (baseScore === headScore) {
        impactedAudits.push([
          `<td nowrap>${auditId}</td>`,
          `<td nowrap>none</td>`,
          `<td nowrap>${baseScore ? "✔" : "☓"}</td>`,
          `<td nowrap>${baseScore ? "✔" : "☓"}</td>`,
        ])
        return
      }
      impactedAudits.push([
        `<td nowrap>${auditId}</td>`,
        `<td nowrap>✔</td>`,
        `<td nowrap>☓</td>`,
        `<td nowrap>✔</td>`,
      ])
      return
    }

    if (scoreDisplayMode === "numeric") {
      const baseScore = baseAudit.score
      const headScore = headAudit.score

      if (baseScore === headScore) {
        impactedAudits.push([
          `<td nowrap>${auditId}</td>`,
          `<td nowrap>none</td>`,
          `<td nowrap>${baseScore}</td>`,
          `<td nowrap>${headScore}</td>`,
        ])
        return
      }
      impactedAudits.push([
        `<td nowrap>${auditId}</td>`,
        `<td nowrap>${formatNumericDiff(headScore - baseScore)}</td>`,
        `<td nowrap>${baseScore}</td>`,
        `<td nowrap>${headScore}</td>`,
      ])
      return
    }

    impactedAudits.push([
      `<td nowrap>${auditId}</td>`,
      `<td nowrap>---</td>`,
      `<td nowrap>---</td>`,
      `<td nowrap>---</td>`,
    ])
  })

  return `<h3>Detailed impact on ${category}</h3>
  <table>
    <thead>
      <tr>
        ${impactedAuditsHeaderCells.join(`
        `)}
      </tr>
    </thead>
    <tbody>
      <tr>${impactedAudits.map(
        (cells) => `
        ${cells.join(`
        `)}`,
      ).join(`
      </tr>
      <tr>`)}
      </tr>
    </tbody>
  </table>`
}

const renderFooter = ({ baseGist, headGist, pullRequestBase }) => {
  return `${
    baseGist
      ? `<sub>
  Impact analyzed comparing <a href="${gistIdToReportUrl(
    baseGist.id,
  )}">${pullRequestBase} report</a> and <a href="${gistIdToReportUrl(
          headGist.id,
        )}">report after merge</a>
</sub>
<br />`
      : ``
  }
<sub>
  Generated by <a href="https://github.com/jsenv/jsenv-lighthouse-score-merge-impact">lighthouse score merge impact</a>
</sub>`
}

const gistIdToReportUrl = (gistId) => {
  return `https://googlechrome.github.io/lighthouse/viewer/?gist=${gistId}`
}
