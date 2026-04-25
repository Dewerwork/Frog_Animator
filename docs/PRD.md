# User Requirements: Web-Based Motion Graphics Tool

**Status:** Draft v1
**Owner:** David
**Last updated:** 2026-04-24

> **Implementation note (2026-04-25):** the tool ships as a packaged desktop
> app (Electron) rather than a hosted website, so it has full access to the
> user's CPU, GPU, and disk. The UI is still HTML/Canvas/WebGL under the
> hood — the "browser" requirements below (WebGL 2, WebCodecs, IndexedDB)
> are satisfied by the bundled Chromium runtime.

## 1. Overview

A desktop animation tool for producing motion-graphics-style content for
YouTube videos. The tool accepts pre-cut image assets (typically PNG layers,
often imported in bulk from PSD files), arranges them in parented hierarchies
inside a timed composition, and lets the creator animate properties —
transform, opacity, tint, filters — via keyframes on a timeline. Final
output is an MP4 file rendered up to 4K resolution.

The tool is purpose-built for cutout-style 2D animation — think Adobe After
Effects scoped down to image-layer motion graphics, with a strong workflow
around reusable character rigs that can be dropped into multiple projects.

## 2. User profile

The tool has a single primary user: a technically-capable solo creator
producing scripted YouTube content. The user prepares image assets in
Photoshop, expects to author and render videos end-to-end on their own
machine, and adds audio in a separate video editor after MP4 export.

The user is comfortable with technical concepts (transforms, anchor points,
easing curves, layer hierarchies) but is not interested in skeletal rigging
or mesh deformation. Characters are assembled by importing artwork that has
already been prepared with logical layer groups.

## 3. Goals & non-goals

### Goals

- Reduce time-per-video for animated YouTube content
- Enable reuse of recurring characters across many videos
- Produce broadcast-quality MP4 output (up to 4K, 5+ minutes)
- Avoid the workflow overhead and cost of pro tools (After Effects, Moho)

### Non-goals

- Replacing After Effects for general use
- Supporting other creators' workflows (this is a personal tool)
- Live-action video, audio editing, or color grading
- Skeletal rigging, mesh deform, or inverse kinematics

## 4. Use cases

### UC-1: Build a character from PSD

The user has prepared a character in Photoshop with logical layer groups
(Body / Head / Arms / etc.). They drag the PSD onto the asset panel; the
tool extracts each layer as an image asset and recreates the group structure
as parented groups in the layer tree. The user adjusts anchor points where
needed (shoulder pivots for arms) and saves the result as a reusable
Character Template.

### UC-2: Animate a scene

The user opens a new composition (1920×1080, 30fps, 30 seconds), instantiates
a saved character template, and adds background layers. They set keyframes
for the character's movement across the timeline — walking from left to
right, with arm sway driven by parented rotation. Easing presets shape the
motion feel.

### UC-3: Render to MP4

With the composition complete, the user clicks Render. The tool encodes the
full timeline at the chosen resolution and produces a single .mp4 file
ready for the user's video editor (Premiere, Resolve), where audio, cuts,
and additional effects are added.

### UC-4: Reuse a character in a new video

For a follow-up video, the user starts a new project and drops in the
previously-saved Hero character template. The character arrives with its
full parented hierarchy and anchor points intact. Edits to this instance do
not affect the master template (copy-on-import).

## 5. Functional requirements

### 5.1 Asset import

- **FR-1.1** Import PNG files via drag-drop onto the canvas or asset panel
- **FR-1.2** Import .psd files; auto-extract every layer as a separate image asset
- **FR-1.3** Preserve PSD layer groups as parent Groups in the composition's layer tree
- **FR-1.4** Preserve PSD layer names as default Layer names
- **FR-1.5** Display imported assets in an Asset Panel with thumbnail previews
- **FR-1.6** Support re-import / replace of an existing asset; all uses update

### 5.2 Composition

- **FR-2.1** Create a new composition with configurable width, height, framerate, and duration
- **FR-2.2** Provide standard presets: 1920×1080 @ 30fps, 1920×1080 @ 60fps, 3840×2160 @ 30fps
- **FR-2.3** Display the composition viewport at correct aspect ratio with a bounding outline
- **FR-2.4** Support multiple compositions per project (each is a separate timeline)

### 5.3 Layer tree

- **FR-3.1** Display all layers in a hierarchical Layers Panel (tree view)
- **FR-3.2** Support arbitrary nesting of Groups and Layers
- **FR-3.3** Drag-and-drop to reorder and re-parent layers
- **FR-3.4** Toggle visibility per layer
- **FR-3.5** Lock layer (prevents selection / accidental edits)
- **FR-3.6** Solo layer (hides all non-soloed layers)
- **FR-3.7** Selecting a layer in the panel selects it on the canvas, and vice versa

### 5.4 Layer properties

Each layer must support the following animatable properties:

- **FR-4.1** Position (x, y)
- **FR-4.2** Rotation (degrees)
- **FR-4.3** Scale (x, y; with uniform toggle)
- **FR-4.4** Anchor point (the layer's own pivot for rotation and scale)
- **FR-4.5** Opacity (0–100%)
- **FR-4.6** Color tint (RGB + intensity)
- **FR-4.7** Blur (radius)
- **FR-4.8** Drop shadow (offset, blur, color, opacity)
- **FR-4.9** Glow (radius, color, intensity)

Group layers must support all transform properties (FR-4.1 through 4.4).
Children inherit the parent's transform.

### 5.5 Keyframe animation

- **FR-5.1** Set a keyframe on any animatable property by editing its value at a given time
- **FR-5.2** Display all keyframes in a Timeline Panel, one row per active property per layer
- **FR-5.3** Drag keyframes horizontally to change their time
- **FR-5.4** Right-click a keyframe for context actions (delete, copy, change easing)
- **FR-5.5** Apply easing presets between keyframes: linear, ease-in, ease-out, ease-in-out, hold/step
- **FR-5.6** Interpolate values continuously at render time using the easing curve between adjacent keyframes

### 5.6 Character templates

- **FR-6.1** Save any Group (with all descendants and property defaults) as a Character Template
- **FR-6.2** Maintain a library of saved templates accessible across all projects
- **FR-6.3** Instantiate a template into a composition; result is a regular Group (independent copy)
- **FR-6.4** Edits to an instantiated template do not affect the master (copy-on-import)
- **FR-6.5** Templates carry anchor points per layer

### 5.7 Playback

- **FR-7.1** Play / pause / scrub the timeline with a transport control
- **FR-7.2** Preview-quality playback mode (lower resolution, possibly half-fps) for real-time scrubbing while editing
- **FR-7.3** Render-quality mode used only during final export
- **FR-7.4** Frame-accurate stepping: next frame / previous frame

### 5.8 Export

- **FR-8.1** Export the active composition as a .mp4 file (H.264 video)
- **FR-8.2** Render at the composition's configured resolution and framerate
- **FR-8.3** Show progress and estimated time during render
- **FR-8.4** Allow cancellation mid-render without corrupting the output
- **FR-8.5** Support 4K (3840×2160) export for compositions up to 5 minutes

### 5.9 Project management

- **FR-9.1** Save the current project (compositions + layer trees + assets + keyframes) to local storage
- **FR-9.2** Load a previously saved project
- **FR-9.3** Maintain multiple named projects
- **FR-9.4** Export a project file (JSON + bundled assets) for backup or transfer
- **FR-9.5** Undo / redo, minimum 50 steps deep

## 6. Non-functional requirements

### Performance

- **NFR-1** Real-time 30fps playback at 1080p preview quality with up to 30 active layers
- **NFR-2** Editor UI remains responsive (60fps interactions) during playback
- **NFR-3** PSD import for a 50-layer file completes in under 10 seconds
- **NFR-4** 4K MP4 export takes no more than 4× real-time (a 5-minute video renders in ≤20 minutes)

### Compatibility

- **NFR-5** Distributed as a packaged desktop app for macOS, Windows, and Linux
- **NFR-6** Bundles Chromium (via Electron) so WebGL 2 + WebCodecs are always available
- **NFR-7** Desktop only — no mobile or tablet support

### Storage

- **NFR-8** Project autosave to IndexedDB inside the app's user-data directory
- **NFR-9** Image assets cached as Blobs in IndexedDB
- **NFR-10** Project bundles save/load to/from native disk via OS file dialogs

### Safety

- **NFR-11** Auto-save every 60 seconds during active editing
- **NFR-12** Confirmation prompt before destructive actions (delete layer, delete project, delete template)

## 7. Out of scope

The following will not be implemented in the initial release. Some may move
into a later version.

- Audio import, editing, or sync (use the user's video editor for audio)
- Sprite swapping for mouth shapes, blinks, hand poses (planned for v4)
- Skeletal / bone-based rigging
- Mesh deformation or warp
- Inverse kinematics
- Live-action video import
- Realtime collaboration
- Cloud project sync
- Mobile / tablet UI
- Linked template instances (edits to master propagate to all uses)
- Custom easing curve editor with bezier handles (planned for v4)
- 3D layers or camera
- Particle systems
- Text layer animation (use rasterized text from Photoshop)
