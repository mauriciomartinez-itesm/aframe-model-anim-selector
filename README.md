# aframe-model-anim-selector

An A-Frame component designed to dynamically select models or mesh parts (`SkinnedMesh` or groups) and play Non-Linear Animation (NLA) clips from a single glTF/GLB file sharing a common armature.

---

## Background and Problem Statement

When working with models exported from Blender where multiple outfits or mesh variations share a single skeleton/armature:

1. **Incompatibility between `gltf-part` and `animation-mixer`**:
   - `gltf-part` isolates and detaches only the specified mesh node from the armature hierarchy. For `SkinnedMesh` instances, vertex deformations rely on bone matrices (`JOINTS_0`, `WEIGHTS_0`, `bindMatrixInverse`). When detached from the bone hierarchy, the skinned mesh collapses or fails to render.
   - `animation-mixer` targets and animates the skeleton bones rather than the mesh nodes directly. If the skeleton is broken or separated from the scene graph, the animation tracks fail to find their targets.
2. **Three.js Group Node Structures**:
   - When a mesh contains multiple primitives or materials, Three.js creates a parent `THREE.Group` node named after the model, while individual sub-meshes receive primitive-specific internal names.
3. **How `model-anim-selector` solves this**:
   - Keeps the full armature hierarchy and all bones intact and active so skeletal kinematics and NLA tracks work uninterrupted.
   - Safely toggles the visibility (`visible = true/false`) of target meshes and parent groups by name or ID, eliminating z-fighting and rendering overhead.
   - Features built-in smooth cross-fading between animations, playback speed control, and bone-safe cloning (`cloneSkinnedHierarchy`) so multiple instances can exist simultaneously in the same scene without bone crosstalk.

---

## Installation

Include A-Frame (1.4.0 or higher, 1.6.0 recommended) and the component script:

```html
<!-- A-Frame -->
<script src="https://aframe.io/releases/1.6.0/aframe.min.js"></script>

<!-- model-anim-selector component -->
<script src="model-anim-selector.js"></script>
```

---

## Basic Usage

Attach the component to an `<a-entity>`, specifying the GLB source, the active model/part ID, and the animation clip:

```html
<a-scene>
  <!-- Basic Lighting -->
  <a-entity light="type: ambient; intensity: 0.8;"></a-entity>
  <a-entity light="type: directional; intensity: 1.2;" position="2 4 3"></a-entity>

  <!-- Ground Plane -->
  <a-plane rotation="-90 0 0" width="10" height="10" color="#2b2b30"></a-plane>

  <!-- Character Entity using the Component -->
  <a-entity
    id="character"
    position="0 0 -2.5"
    model-anim-selector="src: Personaje.glb; model: Ropa1; clip: Iddle;">
  </a-entity>

  <!-- Default Camera -->
  <a-camera position="0 1.0 0"></a-camera>
</a-scene>
```

---

## Component Schema

| Property | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `src` | `string` | `""` | Direct path to the GLB file (e.g. `Personaje.glb`) or asset selector (e.g. `#my-asset`). |
| `model` | `string` | `"Ropa1"` | Name or ID of the model/part to display. Supports comma-separated lists (e.g. `Ropa3, GuantesRopa3`) or `*` to display all meshes. |
| `clip` | `string` | `"Iddle"` | Name of the NLA animation clip to play (e.g. `Iddle`, `CaminandoAdelante`, `CaminandoLado`). |
| `loop` | `string` | `"repeat"` | Playback loop mode: `repeat`, `once`, `pingpong`. |
| `timeScale` | `number` | `1.0` | Playback speed multiplier (e.g. `0.5` for half speed, `2.0` for double speed). |
| `crossFade` | `number` | `0.35` | Duration in seconds for smooth blending between animation clips. |
| `autoplay` | `boolean` | `true` | Automatically starts animation playback upon loading. |
| `clampWhenFinished` | `boolean` | `false` | When `true` and `loop` is `once`, pauses on the final frame instead of resetting. |
| `shadows` | `boolean` | `true` | Automatically enables `castShadow` and `receiveShadow` across all model meshes. |

---

## Examples

### 1. Changing Model or Animation via JavaScript
Attributes can be modified reactively at runtime:

```javascript
const character = document.querySelector('#character');

// Switch outfit / model
character.setAttribute('model-anim-selector', 'model', 'Ropa2');

// Switch animation clip
character.setAttribute('model-anim-selector', 'clip', 'CaminandoAdelante');

// Adjust playback speed
character.setAttribute('model-anim-selector', 'timeScale', 1.5);
```

### 2. Combining Outfits and Accessories (Multiple Parts)
Pass comma-separated part names to display base outfits together with optional accessories:

```html
<!-- Displays Outfit 3 with matching gloves and badge -->
<a-entity
  model-anim-selector="src: Personaje.glb; model: Ropa3, GuantesRopa3, Gafete; clip: CaminandoLado;">
</a-entity>
```

### 3. Multiple Simultaneous Characters in the Same Scene
Due to internal skeleton rebinding (`cloneSkinnedHierarchy`), multiple entities can load the same asset simultaneously without interfering with each other's bones or playback:

```html
<!-- Character 1: Outfit 1 in Idle pose -->
<a-entity
  position="-1.5 0 -3"
  model-anim-selector="src: Personaje.glb; model: Ropa1; clip: Iddle;">
</a-entity>

<!-- Character 2: Outfit 2 walking forward -->
<a-entity
  position="0 0 -3"
  model-anim-selector="src: Personaje.glb; model: Ropa2; clip: CaminandoAdelante;">
</a-entity>

<!-- Character 3: Outfit 3 with gloves walking sideways -->
<a-entity
  position="1.5 0 -3"
  model-anim-selector="src: Personaje.glb; model: Ropa3, GuantesRopa3; clip: CaminandoLado;">
</a-entity>
```

---

## JavaScript API

Access the component instance via `el.components['model-anim-selector']`:

```javascript
const comp = document.querySelector('#character').components['model-anim-selector'];

// Control Methods
comp.setModel('Ropa2');             // Changes active model/outfit
comp.setClip('CaminandoAdelante');   // Changes animation with crossfade
comp.setTimeScale(1.2);              // Sets playback speed
comp.togglePause();                  // Toggles pause / play
comp.pause();                        // Pauses playback
comp.resume();                       // Resumes playback

// Inspection and Queries
console.log(comp.getModels());       // Returns array of detected meshes/parts with visibility state
console.log(comp.getClips());        // Returns array of detected NLA clips and durations
console.log(comp.getCurrentTime());  // Current playback time in seconds
console.log(comp.getDuration());     // Total duration of current clip in seconds
```

---

## Events

The component emits standard DOM events on the host entity:

| Event | Detail (`e.detail`) | Description |
| :--- | :--- | :--- |
| `model-anim-ready` | `{ models, clips, activeModel, activeClip }` | Fired when the model and animation mixer have completed initialization. |
| `model-changed` | `{ selectedModel, visibleMeshesCount }` | Fired when the active model or part filter changes. |
| `clip-changed` | `{ clipName, duration }` | Fired when a new animation clip starts playing. |
| `clip-finished` | `{ action, clipName }` | Fired when a non-looping clip completes playback. |
| `clip-loop` | `{ action, clipName, loopDelta }` | Fired each time an animation loop repeats. |

```javascript
const el = document.querySelector('#character');

el.addEventListener('model-anim-ready', (e) => {
  console.log('Available models:', e.detail.models);
  console.log('Available clips:', e.detail.clips);
});

el.addEventListener('clip-changed', (e) => {
  console.log(`Now playing: ${e.detail.clipName} (${e.detail.duration}s)`);
});
```

---

## Project Structure

- `model-anim-selector.js`: Core A-Frame component implementation.
- `index.html`: Minimal working showcase demonstrating model and animation selection.
- `Personaje.glb`: Sample 3D character asset containing multiple outfit variations and NLA animation clips.
