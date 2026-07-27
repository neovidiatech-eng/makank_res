# Logs

## Overview

The Logs feature records key admin activity so the dashboard can display an audit trail. It is intentionally minimal — only explicit actions are logged, not every request.

## What is logged (current)

| Action | Trigger | Details (ar) |
|--------|---------|--------------|
| `LOGIN` | Successful login via `POST /api/authentication/login/:roleKey` | دخل إلى لوحة التحكم |
| `LOGOUT` | Successful logout via `POST /api/authentication/logout` | خرج من لوحة التحكم |

Only **successful** operations are logged. Failed login attempts are not recorded.

## Log record fields

| Field | Description |
|-------|-------------|
| `id` | UUID |
| `userId` | ID of the user who performed the action |
| `userName` | Display name at the time of the action |
| `userRole` | Role key at the time of the action |
| `action` | `LOGIN` or `LOGOUT` |
| `details` | Human-readable description (Arabic) |
| `createdAt` | Timestamp of the action |

## API

### Get logs

```
GET /api/logs?page=1&limit=10
GET /api/logs?page=1&limit=10&action=LOGIN
```

**Auth:** Admin access token required.

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "personName": "Ahmed Mohamed",
      "role": "Admin",
      "action": "LOGIN",
      "details": "دخل إلى لوحة التحكم",
      "createdAt": "2026-06-04T10:45:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 40,
    "totalPages": 4
  }
}
```

Sorted by newest first.

## Permissions

The `logs` permission (`prefix: logs`, `method: get`) must be assigned to the role. It is seeded into the Admin role by default via `npm run db:seed`.

## What is NOT logged

- Failed login attempts
- Every HTTP request
- Data changes (create / update / delete on any entity)
- Password resets or OTP flows

These may be added in future phases as needed.
