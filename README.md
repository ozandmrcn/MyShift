# Dynamic Shift System (MOST IMPORTANT FEATURE)

This application MUST NOT contain any hardcoded work schedule.

The entire shift system must be fully customizable by the user.

Users must be able to create, edit, delete, duplicate, import and export unlimited shift templates.

Examples of templates:

- Weekday Shift
- Weekend Shift
- Work From Home
- Study Day
- University
- Freelance
- Night Shift
- Holiday
- Custom

Each template can be assigned to any combination of weekdays:

- Monday
- Tuesday
- Wednesday
- Thursday
- Friday
- Saturday
- Sunday

Examples:

- Monday-Friday
- Saturday only
- Tuesday + Thursday
- Every day
- Custom dates

---

# Visual Shift Editor

The application must include a visual timeline editor similar to Google Calendar or Outlook Calendar.

Users should be able to:

- Create unlimited activities
- Drag & Drop activities
- Resize activities by dragging
- Change start time
- Change end time
- Automatically calculate duration
- Duplicate activities
- Delete activities
- Reorder activities
- Assign colors
- Assign icons
- Enable or disable notifications
- Add optional notes

No activity should be hardcoded.

Everything is created by the user.

---

# Activity Model

Every activity contains:

- Name
- Icon
- Color
- Start Time
- End Time
- Duration
- Notification Enabled
- Notification Sound
- Optional Notes

Example:

Name:
Coding

Icon:
💻

Color:
Blue

Start:
07:00

End:
07:50

---

Name:
Coffee Break

Icon:
☕

Color:
Orange

Start:
07:50

End:
08:05

---

Name:
Lunch

Icon:
🍔

Color:
Green

Start:
11:30

End:
12:15

---

# Live Shift Engine

The application MUST NOT require manually starting a timer.

Instead, it should always calculate the current activity based on the system clock.

Examples:

If Windows time is 07:22

Current Activity:
Coding

Remaining:
28 minutes

Next:
Coffee Break

---

If Windows time is 11:47

Current Activity:
Lunch

Remaining:
28 minutes

Next:
Coding

---

If Windows time is 15:51

Current Activity:
Coding

Remaining:
9 minutes

Next:
Shift Finished

The application should automatically detect the correct activity every second.

No manual interaction should be required.

---

# Dashboard

The dashboard should always display:

Current Time

Today's Shift

Current Activity

Next Activity

Remaining Time

Progress Bar

Shift Completion %

Today's Timeline

Example:

08:37

Current Activity

💻 Coding

07:50 - 08:40

Remaining

03:12

Next

☕

Coffee Break

08:40 - 08:55

Shift Progress

██████████░░░░░░ 47%

---

# Timeline

The timeline should always stay synchronized with the current time.

Completed activities:

✔ Green

Current activity:

🔵 Highlighted

Future activities:

⚪ Gray

Automatically scroll to keep the current activity visible.

---

# Notifications

Windows native notifications.

Examples:

"Your shift has started."

"Coding started."

"Coffee Break started."

"Lunch started."

"Activity completed."

"Shift completed."

Support custom notification sounds.

---

# Startup

Option to:

- Launch with Windows
- Start minimized
- Automatically load today's shift
- Immediately calculate the current activity

No manual setup should be required after the initial configuration.

---

# Goal

This application is NOT a Pomodoro timer.

It is NOT a task manager.

It is NOT a habit tracker.

It is a Personal Shift Management System that simulates a real workday and continuously guides the user through their custom schedule.

# Technical Requirements

The application MUST be built using the following technologies:

- Electron (Desktop Framework)
- React 19
- TypeScript
- Vite
- Tailwind CSS v4
- shadcn/ui
- Framer Motion
- Electron Store (persistent settings)
- React Router
- Lucide React Icons
- date-fns
- React Hook Form
- Zod

State Management:

- Zustand

Notifications:

- Windows Native Notification API

Packaging:

- Electron Builder

Target Platform:

- Windows 11 (Primary)
- Windows 10 (Secondary)

The application should be designed specifically for Windows and follow Microsoft's Fluent Design principles.

Use:

- Mica Background
- Acrylic Effects where appropriate
- Rounded corners
- Fluent animations
- Native title bar (or custom Fluent title bar)
- System Tray support
- Windows Startup integration

Architecture:

- Modular
- Component-based
- Scalable
- Maintainable
- Strong TypeScript typing
- Reusable UI components
- Clean folder structure
- Separation of UI and business logic

Everything should work completely offline.

Do NOT use cloud services.

Do NOT require login or account creation.

Do NOT include advertisements.

Do NOT include premium features.

Do NOT include subscriptions.

The project should be production-ready with clean code and best practices.

Whenever there are multiple implementation choices, always choose the solution that provides the best user experience rather than the simplest implementation.
