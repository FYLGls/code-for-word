import pkg from '../package.json'

/** @returns {{ owner: string, repo: string }} */
export function githubRepo() {
  const owner = pkg.codepaste?.githubOwner
  const repo = pkg.codepaste?.githubRepo
  if (owner && repo) return { owner, repo }
  const url = pkg.repository?.url || ''
  const m = String(url).match(/github\.com[/:]([^/]+)\/([^/.]+)/i)
  if (m) return { owner: m[1], repo: m[2] }
  return { owner: 'codepaste-app', repo: 'codepaste' }
}

export function githubHome() {
  const { owner, repo } = githubRepo()
  return `https://github.com/${owner}/${repo}`
}

export function githubReleasesUrl() {
  return `${githubHome()}/releases`
}

export function openExternal(url) {
  if (typeof window !== 'undefined' && window.codepasteDesktop?.openExternal) {
    window.codepasteDesktop.openExternal(url)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}
