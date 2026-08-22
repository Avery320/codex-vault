import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import ForceGraph, {
  type LinkObject,
  type NodeObject,
} from 'force-graph';
import {
  forceX,
  forceY,
  forceCollide,
  forceManyBody,
  forceLink,
} from 'd3-force';
import type {
  ForceCollide,
  ForceLink,
  ForceManyBody,
} from 'd3-force';
import { scaleLinear } from 'd3-scale';
import { Painter } from '../lib/painter';
import { getNodeColor } from '../lib/colors';
import { GraphModelLink } from '../lib/types';
import type {
  ResolvedStyle,
  Forces,
  Labels,
} from '../lib/types';
import type { VisibleGraph } from '../lib/graph-view-model';

export interface GraphViewportSize {
  width: number;
  height: number;
}

export interface ViewportPoint {
  x: number;
  y: number;
}

export interface GraphBounds {
  x: [number, number];
  y: [number, number];
}

interface SimulationNode extends NodeObject {
  id: string;
}

interface SimulationLink extends LinkObject<SimulationNode> {
  source: string | SimulationNode;
  target: string | SimulationNode;
}

export function measureGraphViewport(
  element: HTMLElement,
  fallback: GraphViewportSize
): GraphViewportSize {
  const rect = element.getBoundingClientRect();
  const parent = element.parentElement;
  const parentRect = parent?.getBoundingClientRect();
  return {
    width:
      rect.width ||
      element.clientWidth ||
      parentRect?.width ||
      parent?.clientWidth ||
      fallback.width,
    height:
      rect.height ||
      element.clientHeight ||
      parentRect?.height ||
      parent?.clientHeight ||
      fallback.height,
  };
}

export function graphPointToViewport(
  transform: DOMMatrixReadOnly,
  x: number,
  y: number,
  devicePixelRatio: number
): ViewportPoint {
  const ratio = devicePixelRatio || 1;
  return {
    x: (transform.a * x + transform.c * y + transform.e) / ratio,
    y: (transform.b * x + transform.d * y + transform.f) / ratio,
  };
}

export function computeLabelOpacity(
  highlighted: boolean,
  globalScale: number,
  getOpacity: (scale: number) => number,
  labels: Labels
): number {
  if (labels === 'always' || highlighted) return 1;
  return getOpacity(globalScale);
}

export function computeFitZoom(
  bounds: GraphBounds,
  viewport: GraphViewportSize,
  padding: number,
  maxZoom?: number | null
): number {
  const availableWidth = Math.max(viewport.width - padding * 2, 1);
  const availableHeight = Math.max(viewport.height - padding * 2, 1);
  const graphWidth = Math.max(bounds.x[1] - bounds.x[0], 1e-12);
  const graphHeight = Math.max(bounds.y[1] - bounds.y[0], 1e-12);
  const fitZoom = Math.max(
    1e-12,
    Math.min(1e12, availableWidth / graphWidth, availableHeight / graphHeight)
  );
  return maxZoom == null ? fitZoom : Math.min(fitZoom, maxZoom);
}

export function computeIncomingReferenceCounts(
  graph: VisibleGraph
): Map<string, number> {
  const counts = new Map(graph.nodes.map(node => [node.id, 0]));

  for (const link of graph.links) {
    const sourceId = GraphModelLink.getNodeId(link.source);
    const targetId = GraphModelLink.getNodeId(link.target);
    const source = graph.nodeInfo[sourceId];
    const target = graph.nodeInfo[targetId];
    if (
      sourceId === targetId ||
      source?.type !== 'note' ||
      (target?.type !== 'note' && target?.type !== 'placeholder')
    ) {
      continue;
    }
    counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
  }

  return counts;
}

export function computeNodeRadius(
  incomingReferenceCount: number,
  multiplier: number
): number {
  return (
    Math.min(3.2, 0.8 + Math.sqrt(incomingReferenceCount) * 0.55) * multiplier
  );
}

@customElement('comet-graph-canvas')
export class GraphCanvas extends LitElement {
  static styles = css`
    :host {
      display: block;
      position: absolute;
      inset: 0;
    }

    #canvas-container {
      width: 100%;
      height: 100%;
    }
  `;

  /**
   * Pre-filtered graph data ready for rendering. `nodeInfo` should contain only
   * visible nodes.
   */
  @property({ type: Object }) visibleGraph: VisibleGraph | null = null;
  @property({ type: String }) selectedNodeId: string | null = null;
  @property({ type: String }) hoverNodeId: string | null = null;
  @property({ type: Object }) graphStyle: ResolvedStyle = {} as ResolvedStyle;
  @property({ type: Object }) forces: Forces = {
    collide: 2,
    repel: 30,
    link: 30,
    velocityDecay: 0.4,
  };
  @property({ type: Object }) labels: Labels = { fade: 0 };
  @property({ type: Number }) nodeSizeMultiplier: number = 1;
  @property({ type: Number }) linkWidthMultiplier: number = 2;
  @property({ type: Number }) maxFitZoom: number | null = null;

  // Mutable rendering state closed over by force-graph callbacks.
  private rs = {
    nodeInfo: {} as VisibleGraph['nodeInfo'],
    data: { nodes: [] as SimulationNode[], links: [] as SimulationLink[] },
    selectedNodeId: null as string | null,
    hoverNodeId: null as string | null,
    style: {} as ResolvedStyle,
    forces: {} as Forces,
    nodeSizeMultiplier: 1,
    linkWidthMultiplier: 2,
    incomingReferenceCounts: new Map<string, number>(),
  };

  private readonly getNodeLabelOpacity = scaleLinear()
    .domain([1.2, 2.0])
    .range([0, 1])
    .clamp(true);

  private graphInstance: ForceGraph<SimulationNode, SimulationLink> | null =
    null;
  private firstGraphLoad = true;
  private resizeObserver: ResizeObserver | null = null;
  private readonly onResize = () => this.resizeGraphToViewport();

  render() {
    return html`<div id="canvas-container"></div>`;
  }

  firstUpdated() {
    const container = this.shadowRoot!.getElementById(
      'canvas-container'
    ) as HTMLDivElement;
    container.addEventListener('mouseleave', () => {
      this._emit('canvas-node-hover', null);
    });
    const painter = new Painter();

    this.graphInstance = new ForceGraph<SimulationNode, SimulationLink>(
      container
    )
      .graphData(this.rs.data)
      .backgroundColor(this.rs.style.background || '#202020')
      .linkHoverPrecision(8)
      .d3Force('x', forceX())
      .d3Force('y', forceY())
      .d3Force(
        'collide',
        forceCollide(4 /* default nodeRelSize */ * this.rs.forces.collide || 8)
      )
      .d3Force(
        'charge',
        forceManyBody().strength(-(this.rs.forces.repel || 30))
      )
      .d3Force(
        'link',
        forceLink<SimulationNode, SimulationLink>(this.rs.data.links).distance(
          this.rs.forces.link || 30
        )
      )
      .d3VelocityDecay(1 - (this.rs.forces.velocityDecay ?? 0.4))
      .linkWidth(() => this.rs.style.lineWidth * this.rs.linkWidthMultiplier)
      .nodeCanvasObject(
        (node, ctx, globalScale) => {
          const info = this.rs.nodeInfo[node.id];
          if (!info) return;

          const size = computeNodeRadius(
            this.rs.incomingReferenceCounts.get(node.id) ?? 0,
            this.rs.nodeSizeMultiplier
          );
          const highlighted =
            node.id === this.rs.selectedNodeId || node.id === this.rs.hoverNodeId;
          const fill = getNodeColor(
            info,
            highlighted,
            this.rs.style
          );
          const opacity = computeLabelOpacity(
            highlighted,
            globalScale,
            scale => this.getNodeLabelOpacity(scale),
            this.labels
          );
          const textColor = fill.copy({ opacity });

          const labelPosition = graphPointToViewport(
            ctx.getTransform(),
            node.x ?? 0,
            (node.y ?? 0) + size + 1,
            window.devicePixelRatio || 1
          );

          painter
            .circle(node.x ?? 0, node.y ?? 0, size, fill, fill)
            .screenText(
              info.title,
              labelPosition.x,
              labelPosition.y,
              this.rs.style.fontSize,
              this.rs.style.fontFamily,
              textColor
            );
        }
      )
      .onRenderFramePost((ctx: CanvasRenderingContext2D) => {
        painter.paint(ctx);
      })
      .linkColor(link => {
        const sourceId = GraphModelLink.getNodeId(link.source);
        const targetId = GraphModelLink.getNodeId(link.target);
        const highlighted =
          sourceId === this.rs.selectedNodeId ||
          sourceId === this.rs.hoverNodeId ||
          targetId === this.rs.selectedNodeId ||
          targetId === this.rs.hoverNodeId;
        return highlighted
          ? this.rs.style.highlightedForeground
          : this.rs.style.lineColor;
      })
      .nodePointerAreaPaint(
        (node, color, ctx) => {
          const info = this.rs.nodeInfo[node.id];
          if (!info) return;
          const size = computeNodeRadius(
            this.rs.incomingReferenceCounts.get(node.id) ?? 0,
            this.rs.nodeSizeMultiplier
          );
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x ?? 0, node.y ?? 0, size, 0, 2 * Math.PI);
          ctx.fill();
        }
      )
      .onNodeHover(node => {
        const nodeId = node?.id ?? null;
        this._emit('canvas-node-hover', nodeId);
        container.style.cursor = node ? 'pointer' : 'default';
      })
      .onNodeClick(node => {
        this._emit('canvas-node-click', node.id);
      })
      .onBackgroundClick(() => this._emit('canvas-background-click', null));

    this.resizeGraphToViewport();
    if ('ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver(() =>
        this.resizeGraphToViewport()
      );
      this.resizeObserver.observe(this);
    }
    window.addEventListener('resize', this.onResize);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    window.removeEventListener('resize', this.onResize);
    this.graphInstance?._destructor();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('graphStyle')) {
      this.rs.style = this.graphStyle;
      this.graphInstance?.backgroundColor(this.graphStyle.background);
    }

    if (changed.has('selectedNodeId')) this.rs.selectedNodeId = this.selectedNodeId;
    if (changed.has('hoverNodeId')) this.rs.hoverNodeId = this.hoverNodeId;

    if (changed.has('forces')) {
      this.rs.forces = this.forces;
      if (this.graphInstance) {
        (this.graphInstance.d3Force('collide') as ForceCollide<SimulationNode>)
          ?.radius(
          this.graphInstance.nodeRelSize() * this.forces.collide
        );
        (
          this.graphInstance.d3Force('charge') as ForceManyBody<SimulationNode>
        )?.strength(-this.forces.repel);
        (
          this.graphInstance.d3Force('link') as ForceLink<
            SimulationNode,
            SimulationLink
          >
        )?.distance(this.forces.link);
        this.graphInstance.d3VelocityDecay(1 - this.forces.velocityDecay);
        this.graphInstance.d3ReheatSimulation();
      }
    }

    if (changed.has('labels')) {
      if (typeof this.labels === 'object') {
        const invertedValue = 3 - this.labels.fade;
        this.getNodeLabelOpacity.domain([invertedValue, invertedValue + 0.8]);
      }
    }

    if (changed.has('nodeSizeMultiplier')) {
      this.rs.nodeSizeMultiplier = this.nodeSizeMultiplier;
    }

    if (changed.has('linkWidthMultiplier')) {
      this.rs.linkWidthMultiplier = this.linkWidthMultiplier;
      this.graphInstance?.linkWidth(
        () => this.rs.style.lineWidth * this.rs.linkWidthMultiplier
      );
    }

    if (changed.has('visibleGraph')) {
      const nextGraph: VisibleGraph = this.visibleGraph ?? {
        nodeInfo: {},
        nodes: [],
        links: [],
      };
      this.rs.nodeInfo = nextGraph.nodeInfo;
      this.rs.incomingReferenceCounts =
        computeIncomingReferenceCounts(nextGraph);
      this._updateGraphData(nextGraph);

      if (this.visibleGraph && this.firstGraphLoad && this.graphInstance) {
        this.firstGraphLoad = false;
        this.graphInstance.zoom(this.graphInstance.zoom() * 1.5);
        this.graphInstance.cooldownTicks(100);
        this.graphInstance.onEngineStop(() => {
          this.graphInstance!.onEngineStop(() => {});
          this.zoomToFit(500);
        });
      }
    }
  }

  private zoomToFit(duration = 500) {
    if (!this.graphInstance) return;
    if (this.maxFitZoom == null) {
      this.graphInstance.zoomToFit(duration);
      return;
    }

    const bounds = this.graphInstance.getGraphBbox();
    if (!bounds) return;

    const center = {
      x: (bounds.x[0] + bounds.x[1]) / 2,
      y: (bounds.y[0] + bounds.y[1]) / 2,
    };
    const viewport = measureGraphViewport(this, {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    const zoom = computeFitZoom(bounds, viewport, 10, this.maxFitZoom);

    this.graphInstance.centerAt(center.x, center.y, duration);
    this.graphInstance.zoom(zoom, duration);
  }

  private resizeGraphToViewport() {
    if (!this.graphInstance) return;
    const { width, height } = measureGraphViewport(this, {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    if (width <= 0 || height <= 0) return;
    this.graphInstance.width(width).height(height);
  }

  private _updateGraphData(visibleGraph: VisibleGraph) {
    if (!this.graphInstance) return;

    const nodeIdsToAdd = new Set(visibleGraph.nodes.map(node => node.id));
    const nodeIdsToRemove = new Set<string>();

    for (const node of this.rs.data.nodes) {
      if (nodeIdsToAdd.has(node.id)) {
        nodeIdsToAdd.delete(node.id);
      } else {
        nodeIdsToRemove.add(node.id);
      }
    }

    for (const id of nodeIdsToRemove) {
      const idx = this.rs.data.nodes.findIndex(node => node.id === id);
      if (idx !== -1) this.rs.data.nodes.splice(idx, 1);
    }
    for (const id of nodeIdsToAdd) {
      this.rs.data.nodes.push({ id });
    }

    this.rs.data.links = visibleGraph.links.map(link => ({ ...link }));
    this.graphInstance.graphData(this.rs.data);
    (
      this.graphInstance.d3Force('link') as ForceLink<
        SimulationNode,
        SimulationLink
      >
    )?.links(this.rs.data.links);
  }

  private _emit(eventName: string, detail: unknown) {
    this.dispatchEvent(
      new CustomEvent(eventName, { detail, bubbles: true, composed: true })
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'comet-graph-canvas': GraphCanvas;
  }
}
