# CoachBoard Development Plan

## Product Goal

Build a responsive web MVP for football coaches to visually design drills, save them with structured metadata, combine them into training sessions, calculate realistic materials, and export printable PDFs.

## Milestone 1: Foundation and Auth

Status: Complete.

- Set up Next.js App Router with TypeScript and Tailwind CSS.
- Add Supabase browser and server clients.
- Implement sign up, login, logout, and callback route.
- Protect application routes.
- Build app shell with responsive navigation.
- Add dashboard with quick actions, basic stats, and recent data hooks.
- Add placeholder route shells for later milestones.
- Add Supabase schema with RLS policies.

## Milestone 2: Drill Metadata and Library

- Implement drill create/edit form.
- Persist drill metadata to Supabase.
- Add drill library cards with title, focus, age group, block, duration, player count, materials, and preview image.
- Add filters for search, age group, focus, sub focus, block, drill type, player range, duration range, materials, and favorites.
- Add duplicate/delete actions.

## Milestone 3: Basic Drill Editor

- Add React Konva or Fabric.js.
- Render pitch backgrounds.
- Save canvas JSON to `drill_graphics`.
- Add basic add, select, drag, duplicate, delete, undo, redo, zoom, pan, reset view, and export image.

## Milestone 4: Advanced Editor Objects

- Add players, goalkeepers, opponents, cones, markers, balls, goals, mini goals, poles, mannequins, ladders, arrows, lines, text, zones, and highlight areas.
- Add multi-select and property panel editing.
- Support player names, numbers, jersey colors, icon styles, facing direction, and labels.
- Generate and store preview images.

## Milestone 5: Training Session Builder

- Create/edit training sessions.
- Search and add drills from the library.
- Rearrange drills.
- Assign blocks.
- Override planned duration per session.
- Add coach notes per drill.
- Calculate total planned duration.
- Show training timeline with start/end minutes.

## Milestone 6: Material Logic and Smart Suggestions

- Add sequential/simultaneous timing mode per session drill.
- Calculate maximum material need for sequential drills.
- Add material needs for simultaneous drills.
- Group overview by material type and color.
- Add rule-based drill suggestions by age group, focus, block, player count, and duration.

## Milestone 7: PDF Export and Polish

- Generate printable session PDFs with header, material summary, timeline, and drill detail pages.
- Include drill graphics and coach profile branding.
- Improve tablet/mobile layouts.
- Add loading, empty, and error states.

## Milestone 8: Testing and Deployment

- Add unit tests for material calculation and suggestion logic.
- Add integration tests for auth-protected flows.
- Add smoke tests for dashboard and core CRUD.
- Verify Vercel deployment and Supabase production configuration.
