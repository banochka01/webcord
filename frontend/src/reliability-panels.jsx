import React, { useCallback, useEffect, useState } from 'react';

async function request(apiUrl, path, token, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Request failed');
  return payload;
}

function formatSeen(value) {
  if (!value) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function SessionCenter({ apiUrl, token, onCurrentRevoked }) {
  const [sessions, setSessions] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      const payload = await request(apiUrl, '/me/sessions', token);
      setSessions(payload.sessions || []);
      setStatus('ready');
    } catch (reason) {
      setError(reason.message);
      setStatus('error');
    }
  }, [apiUrl, token]);

  useEffect(() => { refresh(); }, [refresh]);

  async function revoke(session) {
    if (!window.confirm(`End the session on ${session.deviceName}?`)) return;
    const payload = await request(apiUrl, `/me/sessions/${session.id}`, token, { method: 'DELETE' });
    if (payload.currentRevoked) onCurrentRevoked?.();
    else await refresh();
  }

  async function revokeOthers() {
    await request(apiUrl, '/me/sessions', token, { method: 'DELETE' });
    await refresh();
  }

  if (status === 'loading') return <div className="session-center-loading">Loading active sessions...</div>;
  if (status === 'error') return <div className="session-center-error">{error}<button type="button" onClick={refresh}>Retry</button></div>;

  return (
    <div className="session-center">
      <div className="session-center-heading">
        <div><h3>Active sessions</h3><p>Review every signed-in WebCord client and end access remotely.</p></div>
        <button className="ghost-btn" type="button" onClick={revokeOthers}>End other sessions</button>
      </div>
      <div className="session-list">
        {sessions.map((session) => (
          <article className={session.current ? 'session-item current' : 'session-item'} key={session.id}>
            <span className="session-platform">{session.platform.slice(0, 1)}</span>
            <div>
              <strong>{session.deviceName}{session.current ? ' · This device' : ''}</strong>
              <p>{session.platform} · Last active {formatSeen(session.lastSeenAt)}</p>
              <small>{session.ipAddress || 'IP unavailable'}</small>
            </div>
            <button type="button" onClick={() => revoke(session)}>{session.current ? 'Log out' : 'End'}</button>
          </article>
        ))}
      </div>
    </div>
  );
}
