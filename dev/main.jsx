// Dev entry: mounts the built artifact into the phone-frame iframe.
// The artifact itself is never modified — this file exists only so a browser
// has something to load. Production hosting would use an equivalent entry.
import React from "react";
import { createRoot } from "react-dom/client";
import Microcosm from "../dist/microcosm.jsx";

createRoot(document.getElementById("root")).render(<Microcosm />);
