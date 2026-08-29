// Reset control: confirm-tap, fresh random seed.
function ResetButton({ onReset, card }){
  const [armed, setArmed] = React.useState(false);
  React.useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 2600);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button aria-label="Reset world"
      onClick={() => { if (armed){ setArmed(false); onReset(); } else setArmed(true); }}
      style={{ position:"absolute", right:16, zIndex:6,
        bottom: card ? 254 : "calc(env(safe-area-inset-bottom, 0px) + 84px)",
        transition:"bottom 0.25s",
        width:44, height:44, borderRadius:22,
        background: armed ? "rgba(242,178,74,0.18)" : "rgba(21,34,51,0.85)",
        border: armed ? "1.5px solid rgba(242,178,74,0.8)" : "1px solid rgba(94,115,134,0.4)",
        color: armed ? "#F2B24A" : "#8FA3B5", fontSize:17,
        fontFamily:"ui-monospace, Menlo, monospace" }}>
      {armed ? "?" : "\u27F2"}
    </button>
  );
}
