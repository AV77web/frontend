import ColorPicker from "./ColorPicker";

function VersusSetup({
  tempCode,
  colors,
  selectedColor,
  onSelectColor,
  onSetCodePeg,
  onConfirm,
  onBack,
  isWaiting = false,
  opponentCodeSet = false,
}) {
  return (
    <div className="page-wrapper">
      <div className="bomb-container">
        <div className="setup-header">
          <h2 className="setup-title">Imposta il tuo codice segreto</h2>
          <p className="setup-subtitle">
            {isWaiting
              ? "Codice impostato! In attesa che l'avversario imposti il suo codice..."
              : "Scegli 4 colori. Il tuo avversario dovrà indovinarli, mentre tu indovinerai i suoi."}
          </p>
          {opponentCodeSet && (
            <p
              style={{
                color: "#10b981",
                marginTop: "10px",
                textAlign: "center",
                fontFamily: "Orbitron",
              }}
            >
              ✓ L'avversario ha impostato il codice! La partita inizierà a
              breve...
            </p>
          )}
        </div>

        <div className="board-bomb">
          <div className="row-bomb">
            <div className="guess-grid">
              {tempCode.map((colorIndex, j) => (
                <div
                  key={j}
                  className={`peg-bomb ${colorIndex === null ? "empty" : ""}`}
                  style={{
                    backgroundColor:
                      colorIndex !== null ? colors[colorIndex] : "",
                    cursor: isWaiting ? "not-allowed" : "pointer",
                    opacity: isWaiting ? 0.6 : 1,
                  }}
                  onClick={() => !isWaiting && onSetCodePeg(j)}
                />
              ))}
            </div>
          </div>
        </div>

        {!isWaiting && (
          <>
            <ColorPicker
              colors={colors}
              selectedColor={selectedColor}
              onSelect={onSelectColor}
            />

            <button
              className="defuse-btn"
              onClick={onConfirm}
              disabled={!tempCode.every((c) => c !== null)}
            >
              Conferma Codice
            </button>
          </>
        )}

        {isWaiting && (
          <div
            style={{
              textAlign: "center",
              padding: "20px",
              color: "#9ca3af",
              fontFamily: "Orbitron",
            }}
          >
            <div
              style={{
                display: "inline-block",
                width: "40px",
                height: "40px",
                border: "4px solid rgba(255,255,255,0.3)",
                borderTop: "4px solid #fff",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
                marginBottom: "10px",
              }}
            ></div>
            <p>In attesa dell'avversario...</p>
          </div>
        )}

        <div style={{ padding: "12px 16px" }}>
          <button className="back-menu-btn" onClick={onBack}>
            ← Torna alla scelta modalità
          </button>
        </div>
      </div>
    </div>
  );
}

export default VersusSetup;
