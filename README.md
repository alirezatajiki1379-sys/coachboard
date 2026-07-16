# CoachBoard

CoachBoard is a football training planner for coaches. It helps a coach build a private drill library, draw visual drill graphics, detect required material, assemble complete training sessions, manage station groups, and print a professional session plan.

## Feature Overview

- Supabase Auth with private user-scoped drills, sessions, graphics, and templates
- Drill Library with filters, graphic previews, material chips, favorite/duplicate/delete actions
- Create/Edit Drill form with validation, coaching notes, categorization, visual editor, materials, and unsaved-change protection
- Visual drill editor with players, equipment, goals, text labels, lines/arrows, undo/redo, copy/paste, multi-select, alignment helpers, drag-from-toolbox, and user-saved graphic templates
- Automatic material detection from drill graphics plus editable material rows
- Training Session Builder with blocks, drag/drop ordering, station sets, player groups, smart duration calculation, and material summaries
- Session detail and print-friendly session plan with timeline, drill graphics, block materials, player groups, and print/save-as-PDF support

## Tech Stack

- Next.js App Router
- React + TypeScript
- Tailwind CSS
- Supabase Auth, Postgres, and Row Level Security
- Konva / react-konva for the visual drill editor

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a Supabase project.

3. Create `.env.local`:

   ```bash
   cp .env.example .env.local
   ```

4. Fill in:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

   Find these in Supabase under **Project Settings -> API**. Use the project URL and anon public key. Do not use or expose the service role key in this app.

5. Run the SQL in [supabase/schema.sql](supabase/schema.sql) in the Supabase SQL Editor.

6. Start the app:

   ```bash
   npm run dev
   ```

7. Open `http://localhost:3000`.

## Required Supabase Tables

The source of truth for the database is [supabase/schema.sql](supabase/schema.sql). Run it in the Supabase SQL Editor for a new project, or apply the relevant sections if upgrading an older project.

The schema includes:

- `profiles`
- `drills`
- `drill_graphics`
- `drill_graphic_templates`
- `materials`
- `training_sessions`
- `training_session_drills`
- `tags`

Important newer columns/features:

- drill metadata and `drills.materials` JSON
- drill graphics in `drill_graphics.canvas_json`
- `training_sessions.start_time`
- `training_sessions.player_groups`
- `training_session_drills.timing_mode`
- `training_session_drills.simultaneous_group`
- `training_session_drills.participating_groups`
- `training_session_drills.starting_group`
- `drill_graphic_templates.template_json`

The schema also enables RLS and policies so users can only access their own profiles, drills, drill graphics, drill graphic templates, materials, sessions, session drills, and tags.

If an older Supabase project is missing one of these tables, columns, triggers, indexes, or RLS policies, rerun the relevant part of [supabase/schema.sql](supabase/schema.sql).

## Development Commands

```bash
npm run dev      # Start local development
npm run build    # Production build and type check
npm run lint     # Lint project
```

## Demo Data

No production seed button is included. For a clean demo, create data manually through the UI:

1. Sign up or log in.
2. Create 3-5 drills with different focuses and durations.
3. Draw simple graphics using cones, markers, balls, bibs, poles, mannequins, and goals.
4. Click **Update from graphic** in the drill material section, then adjust the final material list if needed.
5. Select a reusable setup in the editor and save it as a user template.
6. Create a training session and add the drills.
7. Move drills into blocks and station sets.
8. Add player groups and notes.
9. Open the session detail page and use **Export PDF** / **Print / save PDF**.

## Manual QA Checklist

Drills:

- Create, edit, duplicate, delete, and favorite a drill
- Confirm Drill Library previews show graphics and no-graphic placeholders
- Open material chip `+N more` popovers and scroll long lists
- Validate required fields on drill create/edit
- Test material detection, manual material rows, and update-from-graphic behavior
- Confirm unsaved-change warning appears before leaving dirty drill forms

Visual editor:

- Add, drag, scale, rotate, mirror, duplicate, delete, copy/paste objects
- Draw solid, dashed, and slalom lines
- Test undo/redo for add, move, delete, line drawing, and template insertion
- Confirm new bibs start without a default number
- Save selection as a user template, insert it, rename it, and delete it
- Save/reopen and verify detail/session previews

Sessions:

- Create, edit, duplicate, delete a session
- Add drills, reorder them, drag between blocks, drag into station sets, and drag back to sequential
- Test sequential and simultaneous duration calculations
- Add, rename, note, and delete player groups
- Set a start time and confirm real clock ranges appear
- Confirm global and block material summaries
- Confirm unsaved-change warning appears before leaving dirty session forms

Print:

- Open `/sessions/[id]/print`
- Check header, timeline, station sets, player groups, material summaries, and drill graphics
- Use browser print and Save as PDF
- Check page breaks with a long session

Responsive:

- Check desktop, tablet-ish, and mobile-ish widths
- Watch for horizontal overflow in Drill Library, Drill Form, Session Builder, and Print page

## Deployment

The app is Vercel-ready.

1. Push this project to a Git provider such as GitHub.
2. In Vercel, click **Add New -> Project** and import the repository.
3. Keep the default Next.js settings.
4. Add environment variables in **Project Settings -> Environment Variables**:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

5. In Supabase, run [supabase/schema.sql](supabase/schema.sql) in the SQL Editor before testing the deployed app.
6. Deploy from Vercel.
7. If using Supabase email confirmation or OAuth later, add the Vercel production URL to Supabase Auth redirect/site URL settings.

Post-deployment test checklist:

- Sign up or log in.
- Create a drill with a graphic and materials.
- Confirm the Drill Library preview and material chips render.
- Save and insert a user drill graphic template.
- Create a training session from saved drills.
- Drag drills between blocks and station sets.
- Confirm player groups, start time, duration, and material summaries.
- Open the session detail page and print page.
- Use browser print and Save as PDF.
- Confirm another user account cannot see the first user's drills or sessions.

## Current Beta Notes

- Browser print/save-as-PDF is the current PDF export path.
- Demo data is created manually through the UI for safety.
- User-created drill graphic templates require the `drill_graphic_templates` table and RLS policy.
