import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "Urso | First click to final sale.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const bear = await readFile(join(process.cwd(), "app/apple-icon.png"));
  const bearSrc = `data:image/png;base64,${bear.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#070707",
          padding: "80px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <img src={bearSrc} width={64} height={64} alt="" />
          <div
            style={{
              fontSize: 40,
              fontWeight: 600,
              color: "#ffffff",
              letterSpacing: "-0.02em",
            }}
          >
            Urso
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 100,
              fontWeight: 600,
              color: "#ffffff",
              letterSpacing: "-0.04em",
              lineHeight: 1.0,
              display: "flex",
            }}
          >
            First click to final sale
            <span style={{ color: "#fe5100" }}>.</span>
          </div>
          <div
            style={{
              marginTop: "28px",
              fontSize: 30,
              color: "rgba(255,255,255,0.58)",
              letterSpacing: "-0.01em",
            }}
          >
            A data agency for founder-led businesses.
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
