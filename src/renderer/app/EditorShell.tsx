import { AssetPanel } from './panels/AssetPanel';
import { LayersPanel } from './panels/LayersPanel';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { TimelinePanel } from './panels/TimelinePanel';
import { Viewport } from './panels/Viewport';
import { TopBar } from './TopBar';

/**
 * Editor layout:
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │                       TopBar                             │
 *   ├──────────┬──────────────────────────────┬────────────────┤
 *   │  Assets  │           Viewport           │   Properties   │
 *   │          │                              │                │
 *   │          ├──────────────────────────────┤                │
 *   │          │           Timeline           │                │
 *   ├──────────┴──────────────────────────────┴────────────────┤
 *   │                       Layers                             │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Each panel is a self-contained component; the shell only owns the grid.
 */
export function EditorShell() {
  return (
    <div className="editor">
      <TopBar />
      <div className="editor__body">
        <aside className="editor__assets">
          <AssetPanel />
        </aside>
        <main className="editor__center">
          <div className="editor__viewport">
            <Viewport />
          </div>
          <div className="editor__timeline">
            <TimelinePanel />
          </div>
        </main>
        <aside className="editor__properties">
          <PropertiesPanel />
        </aside>
      </div>
      <section className="editor__layers">
        <LayersPanel />
      </section>
    </div>
  );
}
