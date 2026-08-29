// ============================================================
// LAYOUT LAYER — viewport breakpoints, desktop chrome, hover CSS.
// Browser-specific, like the render layer; never imported by the sim core.
//
// The app is mobile-first and stays that way: every desktop affordance here is
// ADDITIVE. Pointer Events already unify mouse and touch, so nothing below
// replaces a touch path — it only widens the layout and adds keyboard and hover,
// which a touch device simply never triggers.
// ============================================================

const LAYOUT = {
  wide: 900,      // px viewport width at which the desktop layout takes over
  panelCard: 372, // right panel width showing a specimen
  panelData: 460, // right panel width showing the Observatory (charts need room)
  readable: 1180, // max content width, so charts never smear across an ultrawide
};

// Viewport observer. `fine` is true for mouse/trackpad, false for touch — used
// only to decide whether to advertise keyboard shortcuts, never to gate input.
function useViewport(){
  const read = () => ({
    vw: typeof window === "undefined" ? 1024 : window.innerWidth,
    vh: typeof window === "undefined" ? 768 : window.innerHeight,
    fine: typeof window !== "undefined" && !!window.matchMedia
      && window.matchMedia("(hover: hover) and (pointer: fine)").matches,
  });
  const [v, setV] = React.useState(read);
  React.useEffect(() => {
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setV(read()));
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);
  return { ...v, desktop: v.vw >= LAYOUT.wide };
}

// Inline styles win over stylesheets, so hover/focus rules need !important.
// Keeping them in one place beats scattering onMouseEnter handlers everywhere.
const UI_CSS = `
.mc-hit{ transition: background .13s ease, border-color .13s ease, color .13s ease, transform .13s ease; }
@media (hover: hover) and (pointer: fine){
  .mc-hit:hover{ background: rgba(201,215,227,0.16) !important; color:#E6F0FA !important; }
  .mc-hit-amber:hover{ background: rgba(242,178,74,0.24) !important; }
  .mc-hit-solid:hover{ filter: brightness(1.08); }
  .mc-fab:hover{ background: rgba(31,48,70,0.95) !important; transform: translateY(-1px); }
  .mc-tab:hover{ color:#E6F0FA !important; }
}
.mc-hit:active{ transform: translateY(1px); }
.mc-hit:focus-visible, .mc-fab:focus-visible, .mc-tab:focus-visible{
  outline: 2px solid rgba(242,178,74,0.8); outline-offset: 2px;
}
.mc-scroll{ scrollbar-width: thin; scrollbar-color: rgba(94,115,134,0.5) transparent; }
.mc-scroll::-webkit-scrollbar{ width: 9px; height: 9px; }
.mc-scroll::-webkit-scrollbar-thumb{ background: rgba(94,115,134,0.45); border-radius: 5px; }
.mc-scroll::-webkit-scrollbar-thumb:hover{ background: rgba(94,115,134,0.7); }
.mc-scroll::-webkit-scrollbar-track{ background: transparent; }
.mc-kbd{ display:inline-block; min-width:15px; padding:1px 5px; border-radius:4px; text-align:center;
  background:rgba(201,215,227,0.10); border:1px solid rgba(94,115,134,0.38); font-size:10px; }
`;

function UiStyles(){ return <style dangerouslySetInnerHTML={{ __html: UI_CSS }} />; }
