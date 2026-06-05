import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Issuefy — Daily AI market intelligence";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#15171A",
          color: "#FFFFFF",
          padding: "80px",
          position: "relative",
          fontFamily: "Georgia, serif",
        }}
      >
        {/* Calm blue glow accent in top right */}
        <div
          style={{
            position: "absolute",
            top: -120,
            right: -120,
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(76,118,247,.4), transparent 65%)",
            display: "flex",
          }}
        />

        {/* Eyebrow */}
        <div
          style={{
            fontSize: 18,
            color: "#8b94ff",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontFamily: "Menlo, monospace",
            marginBottom: 32,
            display: "flex",
          }}
        >
          ✦ ISSUEFY
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize: 84,
            lineHeight: 1.04,
            fontWeight: 500,
            letterSpacing: "-0.025em",
            maxWidth: 940,
            display: "flex",
            flexWrap: "wrap",
          }}
        >
          Daily AI market{" "}
          <span style={{ color: "#9DB4FF", fontStyle: "italic", display: "flex" }}>intelligence.</span>
        </div>

        {/* Subhead */}
        <div
          style={{
            fontSize: 28,
            color: "#cfd3db",
            marginTop: 28,
            maxWidth: 880,
            lineHeight: 1.45,
            display: "flex",
          }}
        >
          One short, sourced market brief in your inbox every morning.
        </div>

        {/* Bottom row */}
        <div
          style={{
            position: "absolute",
            bottom: 60,
            left: 80,
            right: 80,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontFamily: "Menlo, monospace",
            color: "#9aa3b2",
            fontSize: 18,
            letterSpacing: "0.04em",
          }}
        >
          <div style={{ display: "flex" }}>issuefy.app</div>
          <div style={{ display: "flex" }}>Built for teams that read the room.</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
