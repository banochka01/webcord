import React, { useEffect, useState } from 'react';

export default function ReleaseBanner({ apiUrl, version, platform = 'windows' }) {
  const [release, setRelease] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`${apiUrl}/client/releases/current?platform=${encodeURIComponent(platform)}&version=${encodeURIComponent(version)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => { if (active) setRelease(payload); })
      .catch(() => {});
    return () => { active = false; };
  }, [apiUrl, platform, version]);

  if (!release?.updateAvailable || dismissed) return null;
  return (
    <aside className={release.required ? 'release-banner required' : 'release-banner'} role="status">
      <div><strong>WebCord {release.version} is ready</strong><span>{release.required ? 'This update is required for full compatibility.' : 'A safer, faster client is available.'}</span></div>
      {release.download?.available ? <a href={release.download.url}>Download</a> : null}
      {!release.required ? <button type="button" aria-label="Dismiss update" onClick={() => setDismissed(true)}>×</button> : null}
    </aside>
  );
}
