import { listen } from "@tauri-apps/api/event";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MicrophoneIcon,
  TranscriptionIcon,
  CancelIcon,
} from "../components/icons";
import "./RecordingOverlay.css";
import { commands } from "@/bindings";
import i18n, { syncLanguageFromSettings } from "@/i18n";
import { getLanguageDirection } from "@/lib/utils/rtl";

type OverlayState = "recording" | "transcribing" | "processing";
type OverlayPosition = "top" | "bottom";

interface ShowOverlayPayload {
  state: OverlayState;
  position: OverlayPosition;
}

const RecordingOverlay: React.FC = () => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [state, setState] = useState<OverlayState>("recording");
  const [overlayPosition, setOverlayPosition] = useState<OverlayPosition>("bottom");
  const [levels, setLevels] = useState<number[]>(Array(16).fill(0));
  const [partialText, setPartialText] = useState<string>("");
  const smoothedLevelsRef = useRef<number[]>(Array(16).fill(0));
  const direction = getLanguageDirection(i18n.language);

  useEffect(() => {
    const setupEventListeners = async () => {
      // Listen for show-overlay event from Rust
      const unlistenShow = await listen<ShowOverlayPayload>(
        "show-overlay",
        async (event) => {
          await syncLanguageFromSettings();
          setState(event.payload.state);
          setOverlayPosition(event.payload.position ?? "bottom");
          setIsVisible(true);
        },
      );

      // Listen for hide-overlay event from Rust
      const unlistenHide = await listen("hide-overlay", () => {
        setIsVisible(false);
        setPartialText("");
      });

      // Listen for live partial transcription updates during recording
      const unlistenPartial = await listen<string>(
        "partial-transcription",
        (event) => {
          setPartialText(event.payload);
        },
      );

      // Listen for mic-level updates
      const unlistenLevel = await listen<number[]>("mic-level", (event) => {
        const newLevels = event.payload as number[];

        // Apply smoothing to reduce jitter
        const smoothed = smoothedLevelsRef.current.map((prev, i) => {
          const target = newLevels[i] || 0;
          return prev * 0.7 + target * 0.3;
        });

        smoothedLevelsRef.current = smoothed;
        setLevels(smoothed.slice(0, 9));
      });

      // Cleanup function
      return () => {
        unlistenShow();
        unlistenHide();
        unlistenPartial();
        unlistenLevel();
      };
    };

    setupEventListeners();
  }, []);

  const getIcon = () => {
    if (state === "recording") {
      return <MicrophoneIcon />;
    } else {
      return <TranscriptionIcon />;
    }
  };

  const indicator = (
    <div className="recording-overlay">
      <div className="overlay-left">{getIcon()}</div>

      <div className="overlay-middle">
        {state === "recording" && (
          <div className="bars-container">
            {levels.map((v, i) => (
              <div
                key={i}
                className="bar"
                style={{
                  height: `${Math.min(20, 4 + Math.pow(v, 0.7) * 16)}px`,
                  transition: "height 60ms ease-out, opacity 120ms ease-out",
                  opacity: Math.max(0.2, v * 1.7),
                }}
              />
            ))}
          </div>
        )}
        {state === "transcribing" && (
          <div className="transcribing-text">{t("overlay.transcribing")}</div>
        )}
        {state === "processing" && (
          <div className="transcribing-text">{t("overlay.processing")}</div>
        )}
      </div>

      <div className="overlay-right">
        {state === "recording" && (
          <div
            className="cancel-button"
            onClick={() => {
              commands.cancelOperation();
            }}
          >
            <CancelIcon />
          </div>
        )}
      </div>
    </div>
  );

  const bubble = partialText ? (
    <div className="transcription-bubble">{partialText}</div>
  ) : null;

  return (
    <div
      dir={direction}
      className={`overlay-root overlay-root--${overlayPosition} ${isVisible ? "overlay-root--visible" : ""}`}
    >
      {overlayPosition === "top" ? (
        <>
          {indicator}
          {bubble}
        </>
      ) : (
        <>
          {bubble}
          {indicator}
        </>
      )}
    </div>
  );
};

export default RecordingOverlay;
