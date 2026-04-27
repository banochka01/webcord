# Webcord API contract (Web + Android + Windows)

Base URLs:
- REST: `https://webcordes.ru/api`
- Socket.IO: `https://webcordes.ru/socket.io`
- Uploads: `https://webcordes.ru/uploads/*`

## Auth
- `POST /register` `{ username, password }` -> `{ token, user }`
- `POST /login` `{ username, password }` -> `{ token, user }`
- `GET /me` -> profile
- `PATCH /me` `{ displayName?, avatarUrl?, statusText? }` -> profile

## Guilds / channels
- `GET /guilds`
- `POST /guilds` `{ name }`
- `GET /channels/:guildId`
- `POST /channels` `{ name, guildId, type: TEXT|VOICE }`

## Messages
- `GET /messages/:channelId`
- `POST /messages` `{ channelId, content, attachmentUrl?, attachmentType?, attachmentName?, replyToId? }`
- `PATCH /messages/:id` `{ content }`
- `DELETE /messages/:id`
- `POST /upload` multipart file

## Friends / DM
- `GET /friends`
- `POST /friends/request` `{ username }`
- `POST /friends/:id/accept`
- `GET /dm/channels`
- `POST /dm/channels` `{ userId }`
- `GET /dm/messages/:dmChannelId`
- `POST /dm/messages` `{ dmChannelId, content }`

## Socket events
Client emit:
- `join-channel { channelId }`
- `join-dm { dmChannelId }`
- `send-message { channelId, content, attachment..., replyToId }`
- `send-dm-message { dmChannelId, content }`
- `join-voice { channelId }`
- `leave-voice`
- `voice-offer`, `voice-answer`, `voice-ice-candidate`

Server emit:
- `new-message`
- `message-updated`
- `message-deleted`
- `dm-new-message`
- `presence-updated { userId, online, at }`
- `voice-participants`, `voice-user-joined`, `voice-user-left`
- `voice-offer`, `voice-answer`, `voice-ice-candidate`
