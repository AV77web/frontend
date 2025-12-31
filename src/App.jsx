import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import "./index.css";
import BombHeader from "./components/BombHeader";
import GuessRow from "./components/GuessRow";
import ColorPicker from "./components/ColorPicker";
import EndScreen from "./components/EndScreen";
import GameBoard from "./components/GameBoard";
import VersusSetup from "./components/VersusSetup";
import Login from "./components/Login/Login";
import Registration from "./components/Registration/Registration";
import Modal from "./components/Modal/Modal";
import { UserList } from "./components/UserList";
import { API_URLS, API_BASE_URL } from "./config";
import Btn from "./components/Btn/Btn";
import RulesOfGameDefault from "./components/RulesOfGameDefault";
import { Leaderboard } from "./components/Leaderboard";

const COLORS_BOMB = [
  "#ef4444",
  "#10b981",
  "#3b82f6",
  "#f59e0b",
  "#ec4899",
  "#06b6d4",
];
const MAX_TURNS = 10;
const SOCKET_URL = API_BASE_URL; // Usa l'URL dinamico dal config

const LogoutIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

function App() {
  const [isLogged, setLogged] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // Stato per gestire il caricamento iniziale
  const [currentUser, setCurrentUser] = useState(null);
  const [socket, setSocket] = useState(null);
  const [isRegisterView, setRegisterView] = useState(false);
  const [mode, setMode] = useState(null); // null | 'normal' | 'devil' | 'versus'
  const [guesses, setGuesses] = useState([]);
  const [currentGuess, setCurrentGuess] = useState(Array(4).fill(null));
  const [selectedColor, setSelectedColor] = useState(0);
  const [gameWon, setGameWon] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [gameOverReason, setGameOverReason] = useState("");
  const [secretCode, setSecretCode] = useState([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [hasStarted, setHasStarted] = useState(false); // per far partire il timer in Diavolo
  const [isSettingCode, setIsSettingCode] = useState(false); // fase in cui P1 imposta il codice (1vs1)
  const [tempCode, setTempCode] = useState(Array(4).fill(null)); // codice scelto da P1
  const [incomingChallenge, setIncomingChallenge] = useState(null);
  const [opponent, setOpponent] = useState(null);
  const [isRulesOfGame, setIsRulesOfGame] = useState(false); // apre la modale con la spiegazione delle regole di gioco
  const [isLeaderboard, setIsLeaderboard] = useState(false); // apre la classifica

  // Nuovi stati per modalità versus simultanea
  const [gameId, setGameId] = useState(null);
  const [mySecretCode, setMySecretCode] = useState([]); // Il mio codice segreto
  const [myGuesses, setMyGuesses] = useState([]); // I miei tentativi verso il codice dell'avversario
  const [opponentGuesses, setOpponentGuesses] = useState([]); // Tentativi dell'avversario verso il mio codice
  const [myCodeSet, setMyCodeSet] = useState(false);
  const [opponentCodeSet, setOpponentCodeSet] = useState(false);
  const [myGameWon, setMyGameWon] = useState(false);
  const [myGameOver, setMyGameOver] = useState(false);
  const [opponentGameWon, setOpponentGameWon] = useState(false);
  const [opponentGameOver, setOpponentGameOver] = useState(false);

  // Ref per tracciare se la partita è stata iniziata da handleGameStart
  const isGameStartedRef = useRef(false);
  // Ref per gameId che viene aggiornato immediatamente (per evitare problemi di timing)
  const gameIdRef = useRef(null);

  // Gestione Finestra
  const handleCloseModal = () => {
    setIsRulesOfGame(false);
  };

  const handleLogout = async () => {
    // 1. Notifica il backend per aggiornare lo stato DB

    try {
      await fetch(API_URLS.LOGOUT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // FONDAMENTALE: invia i cookie al backend
      });
    } catch (error) {
      console.error("Errore logout:", error);
    } finally {
      // 2. Pulizia stato locale e socket (eseguita SEMPRE, anche se il server dà errore)
      setLogged(false);
      setCurrentUser(null);
      if (socket) {
        socket.disconnect();
        console.log("Socket disconnesso");
        setSocket(null);
      }
    }
  };

  // Controllo sessione al caricamento della pagina
  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch(API_URLS.VERIFY, {
          credentials: "include", // FONDAMENTALE: Invia il cookie HttpOnly al backend
        });
        if (response.ok) {
          const data = await response.json();
          if (data.user) {
            handleLoginSuccess(data.user); // Ripristina lo stato utente
          }
        }
      } catch (error) {
        console.log("Nessuna sessione attiva o token scaduto");
      } finally {
        setIsLoading(false); // Smette di caricare in ogni caso
      }
    };
    checkSession();
  }, []);

  // Gestione Socket.io
  useEffect(() => {
    if (isLogged && !socket) {
      const newSocket = io(SOCKET_URL);

      newSocket.on("connect", () => {
        console.log("Socket connesso:", newSocket.id);
        if (currentUser) {
          newSocket.emit("register_user", currentUser);
        }
      });

      setSocket(newSocket);

      return () => newSocket.close();
    }
  }, [isLogged, currentUser]);

  // Listener per eventi socket nella modalità versus
  useEffect(() => {
    if (!socket || mode !== "versus" || !gameId) return;

    const handleOpponentCodeSet = () => {
      setOpponentCodeSet(true);
      console.log("[VERSUS] Avversario ha impostato il codice");
    };

    const handleBothCodesSet = () => {
      console.log("[VERSUS] Entrambi i codici impostati, inizia la partita");
      setIsSettingCode(false);
    };

    const handleGuessFeedback = ({ guessData, isWin, gameOver }) => {
      console.log("[VERSUS] Feedback ricevuto:", {
        guessData,
        isWin,
        gameOver,
      });
      setMyGuesses((prev) => [...prev, guessData]);
      if (isWin) {
        setMyGameWon(true);
      }
      if (gameOver) {
        setMyGameOver(true);
      }
    };

    const handleOpponentGuess = ({ guessData }) => {
      console.log("[VERSUS] Tentativo avversario ricevuto:", guessData);
      setOpponentGuesses((prev) => [...prev, guessData]);
    };

    const handleOpponentGameStatus = ({ opponentWon, opponentLost }) => {
      console.log("[VERSUS] Stato avversario:", { opponentWon, opponentLost });
      if (opponentWon) {
        setOpponentGameWon(true);
      }
      if (opponentLost) {
        setOpponentGameOver(true);
      }
    };

    const handleOpponentDisconnected = () => {
      alert("L'avversario si è disconnesso. La partita è terminata.");
      resetGame();
    };

    const handleGuessError = ({ error }) => {
      alert(`Errore: ${error}`);
    };

    socket.on("opponent_code_set", handleOpponentCodeSet);
    socket.on("both_codes_set", handleBothCodesSet);
    socket.on("guess_feedback", handleGuessFeedback);
    socket.on("opponent_guess", handleOpponentGuess);
    socket.on("opponent_game_status", handleOpponentGameStatus);
    socket.on("opponent_disconnected", handleOpponentDisconnected);
    socket.on("guess_error", handleGuessError);

    return () => {
      socket.off("opponent_code_set", handleOpponentCodeSet);
      socket.off("both_codes_set", handleBothCodesSet);
      socket.off("guess_feedback", handleGuessFeedback);
      socket.off("opponent_guess", handleOpponentGuess);
      socket.off("opponent_game_status", handleOpponentGameStatus);
      socket.off("opponent_disconnected", handleOpponentDisconnected);
      socket.off("guess_error", handleGuessError);
    };
  }, [socket, mode, gameId]);

  // Gestisce l'inizio della partita 1vs1
  const handleGameStart = (data) => {
    console.log("[VERSUS] Partita iniziata:", data);
    console.log("[VERSUS] gameId ricevuto:", data.gameId);
    // Segna che la partita è stata iniziata da handleGameStart
    isGameStartedRef.current = true;
    // Imposta gameId sia nello stato che nel ref (ref per accesso immediato)
    gameIdRef.current = data.gameId;
    setGameId(data.gameId);
    setOpponent(data.opponent);
    // Reset stati versus prima di impostare la modalità
    setMySecretCode([]);
    setMyGuesses([]);
    setOpponentGuesses([]);
    setMyCodeSet(false);
    setOpponentCodeSet(false);
    setMyGameWon(false);
    setMyGameOver(false);
    setOpponentGameWon(false);
    setOpponentGameOver(false);
    setTempCode(Array(4).fill(null));
    setTimeLeft(0);
    // Ora imposta la modalità (questo scatenerà useEffect ma isGameStartedRef impedirà il reset di gameId)
    setMode("versus");
    // Entrambi devono impostare il codice
    setIsSettingCode(true);
  };

  // inizializza partita quando scelgo una modalità
  useEffect(() => {
    if (!mode) return;

    // reset stato comune
    setGuesses([]);
    setCurrentGuess(Array(4).fill(null));
    setSelectedColor(0);
    setGameWon(false);
    setGameOver(false);
    setGameOverReason("");
    setHasStarted(false);
    setTempCode(Array(4).fill(null));

    if (mode === "versus") {
      // Se la partita è stata iniziata da handleGameStart, non resettare gameId e opponent
      if (isGameStartedRef.current) {
        // Resetta solo gli stati di gioco, ma mantieni gameId, opponent e isSettingCode
        setMySecretCode([]);
        setMyGuesses([]);
        setOpponentGuesses([]);
        setMyCodeSet(false);
        setOpponentCodeSet(false);
        setMyGameWon(false);
        setMyGameOver(false);
        setOpponentGameWon(false);
        setOpponentGameOver(false);
        setTempCode(Array(4).fill(null));
        setTimeLeft(0);
        // Reset del flag dopo averlo usato
        isGameStartedRef.current = false;
      } else {
        // Reset completo quando si cambia modalità manualmente
        setMySecretCode([]);
        setMyGuesses([]);
        setOpponentGuesses([]);
        setMyCodeSet(false);
        setOpponentCodeSet(false);
        setMyGameWon(false);
        setMyGameOver(false);
        setOpponentGameWon(false);
        setOpponentGameOver(false);
        gameIdRef.current = null;
        setGameId(null);
        setOpponent(null);
        setTimeLeft(0);
        setIsSettingCode(true);
      }
    } else {
      // normal / devil → codice random
      setSecretCode(
        Array(4)
          .fill(0)
          .map(() => Math.floor(Math.random() * COLORS_BOMB.length))
      );
      setTimeLeft(mode === "devil" ? 60 : 0);
      setIsSettingCode(false);
    }
  }, [mode]);

  // timer solo in modalità Diavolo e solo dopo Start
  useEffect(() => {
    if (mode !== "devil") return;
    if (!hasStarted) return;
    if (gameWon || gameOver) return;

    if (timeLeft <= 0) {
      setGameOver(true);
      setGameOverReason("timer");
      return;
    }

    const timer = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft, gameWon, gameOver, mode, hasStarted]);

  const addPeg = (index) => {
    // Per modalità versus, controlla myGameWon/myGameOver invece di gameWon/gameOver
    if (mode === "versus") {
      if (myGameWon || myGameOver || myGuesses.length >= MAX_TURNS) return;
    } else {
      if (gameWon || gameOver || guesses.length >= MAX_TURNS) return;
    }

    setCurrentGuess((prev) =>
      prev.map((val, i) => (i === index ? selectedColor : val))
    );
  };

  const submitGuess = () => {
    if (mode === "versus") {
      // Modalità versus: invia il tentativo via socket
      if (!currentGuess.every((c) => c !== null)) return;
      if (myGameWon || myGameOver || myGuesses.length >= MAX_TURNS) return;

      // Usa gameIdRef per accesso immediato
      const currentGameId = gameIdRef.current || gameId;

      if (!currentGameId || !socket) {
        console.error("[VERSUS] gameId o socket non disponibili", {
          gameId: currentGameId,
          gameIdRef: gameIdRef.current,
          socket: !!socket,
        });
        return;
      }

      console.log(
        "[VERSUS] Invio tentativo:",
        currentGuess,
        "con gameId:",
        currentGameId
      );
      socket.emit("submit_guess", {
        gameId: currentGameId,
        guess: currentGuess,
      });

      setCurrentGuess(Array(4).fill(null));
    } else {
      // Modalità normale/devil: logica locale
      if (gameWon || gameOver || guesses.length >= MAX_TURNS) return;
      if (!currentGuess.every((c) => c !== null)) return;

      const feedback = calculateFeedback(secretCode, currentGuess);
      const newGuesses = [...guesses, { guess: currentGuess, feedback }];
      setGuesses(newGuesses);
      setCurrentGuess(Array(4).fill(null));

      if (currentGuess.every((val, idx) => val === secretCode[idx])) {
        setGameWon(true);
        return;
      }

      if (newGuesses.length >= MAX_TURNS) {
        setGameOver(true);
        setGameOverReason("turns");
      }
    }
  };

  const calculateFeedback = (secret, guess) => {
    const secretCopy = [...secret];
    const guessCopy = [...guess];
    let black = 0;
    let white = 0;

    // neri
    secretCopy.forEach((val, i) => {
      if (val === guessCopy[i]) {
        black++;
        secretCopy[i] = guessCopy[i] = -1;
      }
    });

    // bianchi
    secretCopy.forEach((val) => {
      if (val !== -1) {
        const idx = guessCopy.indexOf(val);
        if (idx !== -1) {
          white++;
          guessCopy[idx] = -1;
        }
      }
    });

    return [...Array(black).fill("black"), ...Array(white).fill("white")];
  };

  /*  if (true) return <Modal /> */

  const resetGame = () => {
    // Reset anche stati versus
    isGameStartedRef.current = false;
    gameIdRef.current = null;
    setGameId(null);
    setOpponent(null);
    setMySecretCode([]);
    setMyGuesses([]);
    setOpponentGuesses([]);
    setMyCodeSet(false);
    setOpponentCodeSet(false);
    setMyGameWon(false);
    setMyGameOver(false);
    setOpponentGameWon(false);
    setOpponentGameOver(false);
    // torna al menu principale
    setMode(null);
  };

  // handler per impostare il codice in 1 vs 1
  const setCodePeg = (index) => {
    setTempCode((prev) =>
      prev.map((v, i) => (i === index ? selectedColor : v))
    );
  };

  const confirmSecretCode = () => {
    if (!tempCode.every((c) => c !== null)) return;

    if (mode === "versus") {
      // Invia il codice segreto al server
      setMySecretCode(tempCode);
      setMyCodeSet(true);

      // Usa gameIdRef per accesso immediato (evita problemi di timing con lo stato)
      const currentGameId = gameIdRef.current || gameId;

      if (socket && currentGameId) {
        console.log(
          "[VERSUS] Invio codice segreto:",
          tempCode,
          "con gameId:",
          currentGameId
        );
        socket.emit("set_secret_code", {
          gameId: currentGameId,
          secretCode: tempCode,
        });
      } else {
        console.error("[VERSUS] Socket o gameId non disponibili", {
          socket: !!socket,
          gameId: currentGameId,
          gameIdRef: gameIdRef.current,
        });
      }

      // Non cambiare isSettingCode qui - aspetta che anche l'avversario imposti il codice
      // Il socket controller notificherà quando entrambi hanno impostato
    } else {
      // Modalità normale (non dovrebbe arrivare qui in versus)
      setSecretCode(tempCode);
      setIsSettingCode(false);
    }

    setTempCode(Array(4).fill(null));
  };

  const handleLoginSuccess = (user) => {
    console.log("Dati utenti ricevuti dal Login:", user);
    setLogged(true);
    setCurrentUser(typeof user === "string" ? user : user?.username || "Guest");
    setRegisterView(false); // Assicura di tornare alla vista di gioco
  };

  const minutes = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const seconds = String(timeLeft % 60).padStart(2, "0");

  // Calcola i valori per il bottone principale in base alla modalità
  const getMainButtonProps = () => {
    if (mode === "versus") {
      return {
        disabled:
          myGameWon || myGameOver || !currentGuess.every((c) => c !== null),
        label: "DEFUSE NOW",
        onClick: submitGuess,
      };
    } else if (mode === "devil" && !hasStarted) {
      return {
        disabled: false,
        label: "START",
        onClick: () => setHasStarted(true),
      };
    } else {
      return {
        disabled: gameWon || gameOver || !currentGuess.every((c) => c !== null),
        label: "DEFUSE NOW",
        onClick: submitGuess,
      };
    }
  };

  const mainButtonProps = getMainButtonProps();

  // Mostra una schermata di caricamento mentre verifichiamo il cookie
  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          color: "white",
          fontSize: "1.5rem",
        }}
      >
        Caricamento...
      </div>
    );
  }

  // Mostra la classifica se lo stato è attivo
  if (isLeaderboard) {
    return <Leaderboard onClose={() => setIsLeaderboard(false)} />;
  }

  // --- Logica di Rendering Unificata ---
  return !isLogged ? (
    // Se l'utente NON è loggato...
    isRegisterView ? (
      // ...e vuole registrarsi, mostra Registration
      <Registration
        onRegisterSuccess={handleLoginSuccess}
        onShowLogin={() => setRegisterView(false)}
      />
    ) : (
      // ...altrimenti, mostra Login
      <Login
        onLoginSuccess={handleLoginSuccess}
        onShowRegister={() => setRegisterView(true)}
        onGuestLogin={handleLoginSuccess} // Anche l'ospite viene "loggato"
      />
    )
  ) : !mode ? (
    // Se l'utente è loggato ma non ha scelto la modalità, mostra il menu
    <div className="page-wrapper">
      <div className="mode-menu">
        <h1 className="menu-title">MASTERMIND SCAM</h1>
        <p className="menu-subtitle">
          Scegli la modalità o{" "}
          <Btn variant="simple" onClick={() => setIsRulesOfGame(true)}>
            IMPARA LE REGOLE DI GIOCO
          </Btn>
        </p>

        {/* REGOLE DEL GIOCO */}
        {isRulesOfGame && <RulesOfGameDefault onClose={handleCloseModal} />}

        <button className="menu-btn" onClick={() => setMode("normal")}>
          Modalità Normale
        </button>
        <button
          className="menu-btn"
          onClick={() => {
            if (currentUser === "Guest") {
              alert("This mode is reserved to registered users only!");
              return;
            }
            setMode("versus");
          }}
          style={
            currentUser === "Guest"
              ? { opacity: 0.5, cursor: "not-allowed" }
              : {}
          }
        >
          1 vs 1 (Codemaker / Codebreaker) {currentUser === "Guest" && "🔒"}
        </button>
        <button className="menu-btn" onClick={() => setMode("devil")}>
          Modalità Diavolo
        </button>
        <button
          className="menu-btn"
          onClick={() => {
            if (currentUser === "Guest") {
              alert("This ranking is reserved to registered users only!");
              return;
            }
            setIsLeaderboard(true);
          }}
          style={
            currentUser === "Guest"
              ? { opacity: 0.5, cursor: "not-allowed" }
              : {}
          }
        >
          Ranking {currentUser === "Guest" && "🔒"}
        </button>
        <button
          className="menu-btn"
          onClick={handleLogout}
          style={{
            marginTop: "24px",
            background: "linear-gradient(135deg, #4b5563, #374151)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          }}
        >
          <LogoutIcon />
          LOGOUT
        </button>
      </div>
    </div>
  ) : mode === "versus" && isSettingCode ? (
    // Fase impostazione codice
    !opponent ? (
      <UserList
        socket={socket}
        currentUser={currentUser}
        onBack={() => setMode(null)}
        onGameStart={handleGameStart}
      />
    ) : (
      <VersusSetup
        tempCode={tempCode}
        colors={COLORS_BOMB}
        selectedColor={selectedColor}
        onSelectColor={setSelectedColor}
        onSetCodePeg={setCodePeg}
        onConfirm={confirmSecretCode}
        onBack={() => setMode(null)}
        isWaiting={myCodeSet && !opponentCodeSet}
        opponentCodeSet={opponentCodeSet}
      />
    )
  ) : mode === "versus" && !isSettingCode ? (
    // Fase di gioco versus - mostra due board
    <div className="page-wrapper">
      <div className="bomb-container">
        <div style={{ padding: "12px 16px" }}>
          <button className="back-menu-btn" onClick={() => setMode(null)}>
            ← Torna alla scelta modalità
          </button>
        </div>

        <BombHeader
          minutes="00"
          seconds="00"
          guessesCount={myGuesses.length}
          maxTurns={MAX_TURNS}
          mode={mode}
        />

        {/* Board principale: indovina il codice dell'avversario */}
        <div style={{ marginBottom: "40px" }}>
          <h3
            style={{
              color: "white",
              textAlign: "center",
              marginBottom: "20px",
              fontFamily: "Orbitron",
            }}
          >
            Indovina il codice di {opponent}
          </h3>
          {!myGameWon && !myGameOver ? (
            <GameBoard
              guesses={myGuesses}
              currentGuess={currentGuess}
              colors={COLORS_BOMB}
              canPlay={myGuesses.length < MAX_TURNS}
              onPegClick={addPeg}
              selectedColor={selectedColor}
              onSelectColor={setSelectedColor}
              mainButtonLabel={mainButtonProps.label}
              mainButtonDisabled={mainButtonProps.disabled}
              mainButtonOnClick={mainButtonProps.onClick}
            />
          ) : (
            <EndScreen
              gameWon={myGameWon}
              gameOverReason={myGameOver ? "turns" : ""}
              guessesCount={myGuesses.length}
              secretCode={[]} // Non mostriamo il codice dell'avversario fino alla fine
              onReset={resetGame}
              colors={COLORS_BOMB}
            />
          )}
        </div>

        {/* Board secondaria: mostra i tentativi dell'avversario verso il tuo codice */}
        <div
          style={{
            borderTop: "2px solid rgba(255,255,255,0.2)",
            paddingTop: "30px",
            marginTop: "30px",
          }}
        >
          <h3
            style={{
              color: "white",
              textAlign: "center",
              marginBottom: "20px",
              fontFamily: "Orbitron",
            }}
          >
            {opponent} sta indovinando il tuo codice
            {opponentGameWon && (
              <span style={{ color: "#ef4444", marginLeft: "10px" }}>
                💥 HA VINTO!
              </span>
            )}
            {opponentGameOver && !opponentGameWon && (
              <span style={{ color: "#10b981", marginLeft: "10px" }}>
                ✅ HA PERSO!
              </span>
            )}
          </h3>
          <div className="board-bomb">
            {opponentGuesses.map((g, i) => (
              <GuessRow
                key={i}
                guess={g.guess}
                feedback={g.feedback}
                isCurrent={false}
                colors={COLORS_BOMB}
                onPegClick={() => {}}
              />
            ))}
            {opponentGuesses.length === 0 && (
              <div
                style={{ color: "white", textAlign: "center", padding: "20px" }}
              >
                In attesa del primo tentativo...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  ) : (
    // Altrimenti, l'utente è loggato e in partita: mostra la schermata di gioco
    <div className="page-wrapper">
      <div className="bomb-container">
        {guesses.length === 0 && !isSettingCode && (
          <div style={{ padding: "12px 16px" }}>
            <button className="back-menu-btn" onClick={() => setMode(null)}>
              ← Torna alla scelta modalità
            </button>
          </div>
        )}
        <BombHeader
          minutes={minutes}
          seconds={seconds}
          guessesCount={guesses.length}
          maxTurns={MAX_TURNS}
          mode={mode}
        />
        {!gameWon && !gameOver ? (
          <GameBoard
            guesses={guesses}
            currentGuess={currentGuess}
            colors={COLORS_BOMB}
            canPlay={guesses.length < MAX_TURNS}
            onPegClick={addPeg}
            selectedColor={selectedColor}
            onSelectColor={setSelectedColor}
            mainButtonLabel={mainButtonProps.label}
            mainButtonDisabled={mainButtonProps.disabled}
            mainButtonOnClick={mainButtonProps.onClick}
          />
        ) : (
          <EndScreen
            gameWon={gameWon}
            gameOverReason={gameOverReason}
            guessesCount={guesses.length}
            secretCode={secretCode}
            onReset={resetGame}
            colors={COLORS_BOMB}
          />
        )}
      </div>
    </div>
  );
}

export default App;
