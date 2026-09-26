/* =================================================================
 *  Microsoft Edge Extension - Tetris Hold Feature
 *  Target Page: https://dennyura.cloudfree.jp/games/EnglishClub_Tetris/Tetris.html
 * ================================================================= */

// 1. ミノの初期定義 (指定の各色・4x4形状配列)
const TETRIS_PIECES = {
    1: { name: 'Z', color: '#66CCFF', shape: [[0,0,0,0],[1,1,0,0],[0,1,1,0],[0,0,0,0]] },
    2: { name: 'S', color: '#FF9922', shape: [[0,0,0,0],[0,0,1,1],[0,1,1,0],[0,0,0,0]] },
    3: { name: 'I', color: '#6666FF', shape: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]] },
    4: { name: 'L', color: '#CC55CC', shape: [[0,1,0,0],[0,1,0,0],[0,1,1,0],[0,0,0,0]] },
    5: { name: 'J', color: '#FFDD22', shape: [[0,0,1,0],[0,0,1,0],[0,1,1,0],[0,0,0,0]] },
    6: { name: 'T', color: '#FF4444', shape: [[0,0,0,0],[1,1,1,0],[0,1,0,0],[0,0,0,0]] },
    7: { name: 'O', color: '#55BB55', shape: [[0,0,0,0],[0,1,1,0],[0,1,1,0],[0,0,0,0]] }
};

// 2. ホールド機能の内部状態管理変数
let holdPieceId = null;
let hasHeldThisTurn = false;
let holdBoardSnapshot = null;
let boardCheckInterval = null;
const activeKeys = new Set();

// UI要素の参照
let holdCanvas = null;
let holdCtx = null;
let holdContainer = null;

/**
 * 2次元配列のディープコピーを作成（副作用・汚染防止）
 */
function copyShape(shape) {
    if (!shape) return [];
    return shape.map(row => [...row]);
}

/**
 * Web Audio APIを利用してホールド時の効果音を動的に生成・再生する
 */
function playHoldSound() {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        const ctx = new AudioContextClass();

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        // 爽やかで軽いピピッというアップトーン音
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5 (ド)
        osc.frequency.exponentialRampToValueAtTime(1046.50, ctx.currentTime + 0.07); // C6 (高いド)

        gain.gain.setValueAtTime(1.0, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.07);
    } catch (e) {
        console.warn("[Tetris Hold Extension] 効果音の再生に失敗しました:", e);
    }
}

/**
 * ホールド用Canvasに保持中のミノを描画する
 */
function renderHoldPiece() {
    if (!holdCtx || !holdCanvas) return;

    // キャンバスクリア (背景色 #222)
    holdCtx.fillStyle = '#222222';
    holdCtx.fillRect(0, 0, holdCanvas.width, holdCanvas.height);

    if (!holdPieceId || !TETRIS_PIECES[holdPieceId]) return;

    const piece = TETRIS_PIECES[holdPieceId];
    const shape = piece.shape;
    const cellSize = 30;

    holdCtx.lineWidth = 0.5;
    holdCtx.strokeStyle = '#000000';

    for (let row = 0; row < shape.length; row++) {
        for (let col = 0; col < shape[row].length; col++) {
            if (shape[row][col]) {
                const x = col * cellSize;
                const y = row * cellSize;

                holdCtx.fillStyle = piece.color;
                holdCtx.fillRect(x, y, cellSize, cellSize);
                holdCtx.strokeRect(x, y, cellSize, cellSize);
            }
        }
    }
}

/**
 * ゲーム本体のNEXT画面(#nextScreen)に次のミノを描画する
 */
function renderNextPiece() {
    const nextCanvas = document.getElementById('nextScreen');
    if (!nextCanvas) return;
    const ctx = nextCanvas.getContext('2d');
    if (!ctx) return;

    // キャンバスクリア (背景色 #000000)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);

    let nextId = null;
    try {
        if (typeof _0xdcb38e !== 'undefined') {
            nextId = _0xdcb38e;
        } else if (typeof window._0xdcb38e !== 'undefined') {
            nextId = window._0xdcb38e;
        }
    } catch (e) {}

    if (!nextId || !TETRIS_PIECES[nextId]) return;

    const piece = TETRIS_PIECES[nextId];
    const shape = piece.shape;
    const cellSize = 30;

    ctx.lineWidth = 0.5;
    ctx.strokeStyle = '#000000';

    // オフセット無しの (0, 0) 基準で描画
    for (let row = 0; row < shape.length; row++) {
        for (let col = 0; col < shape[row].length; col++) {
            if (shape[row][col]) {
                const x = col * cellSize;
                const y = row * cellSize;

                ctx.fillStyle = piece.color;
                ctx.fillRect(x, y, cellSize, cellSize);
                ctx.strokeRect(x, y, cellSize, cellSize);
            }
        }
    }
}

/**
 * ホールド用UIコンテナおよびCanvasを動的に生成・挿入する
 */
function createHoldUI() {
    if (document.getElementById('tetris-hold-box')) return;

    const gameWrap = document.querySelector('.game-wrap');
    const playScreen = document.getElementById('playScreen');

    if (!gameWrap || !playScreen) {
        setTimeout(createHoldUI, 100);
        return;
    }

    // HOLD枠のコンテナ作成（CSSデザイン適用）
    holdContainer = document.createElement('div');
    holdContainer.id = 'tetris-hold-box';
    holdContainer.style.width = '140px';
    holdContainer.style.padding = '10px 12px';
    holdContainer.style.background = '#1a1a1a';
    holdContainer.style.border = '2px solid #333';
    holdContainer.style.borderRadius = '6px';
    holdContainer.style.textAlign = 'center';
    holdContainer.style.boxShadow = 'inset 0 0 8px rgba(0, 0, 0, 0.4)';
    holdContainer.style.display = 'flex';
    holdContainer.style.flexDirection = 'column';
    holdContainer.style.alignItems = 'center';
    holdContainer.style.gap = '6px';

    // ラベル（"HOLD [U]"）
    const label = document.createElement('div');
    label.className = 'score-label';
    label.style.fontSize = '12px';
    label.style.letterSpacing = '2px';
    label.style.color = '#9aa';
    label.innerText = 'HOLD [U]';

    // ホールド枠用のCanvas (120x120px = 30px * 4セル)
    holdCanvas = document.createElement('canvas');
    holdCanvas.id = 'holdScreen';
    holdCanvas.width = 120;
    holdCanvas.height = 120;
    holdCanvas.style.background = '#222';
    holdCanvas.style.imageRendering = 'pixelated';
    holdCanvas.style.border = '2px solid #333';
    holdCanvas.style.borderRadius = '6px';

    holdCtx = holdCanvas.getContext('2d');

    holdContainer.appendChild(label);
    holdContainer.appendChild(holdCanvas);

    // プレイ画面(playScreen)の左側に挿入
    gameWrap.insertBefore(holdContainer, playScreen);

    renderHoldPiece();
    console.log("[Tetris Hold Extension] HOLD UIを画面左側に生成しました。");
}

/**
 * ホールド状態とUIを初期化・リセットする
 */
function resetHold() {
    holdPieceId = null;
    hasHeldThisTurn = false;
    holdBoardSnapshot = null;
    if (boardCheckInterval) {
        clearInterval(boardCheckInterval);
        boardCheckInterval = null;
    }
    renderHoldPiece();
    console.log("[Tetris Hold Extension] ホールド状態をリセットしました。");
}

/**
 * 盤面配列(_0xbbda4e)の変更を監視してターン切替(設置)を検知する関数
 */
function startBoardMonitoring() {
    if (boardCheckInterval) clearInterval(boardCheckInterval);

    boardCheckInterval = setInterval(() => {
        if (!hasHeldThisTurn) {
            clearInterval(boardCheckInterval);
            boardCheckInterval = null;
            return;
        }

        try {
            const currentBoard = (typeof _0xbbda4e !== 'undefined') ? _0xbbda4e : window._0xbbda4e;
            if (!currentBoard) return;

            const currentSnapshot = JSON.stringify(currentBoard);

            if (currentSnapshot !== holdBoardSnapshot) {
                hasHeldThisTurn = false;
                holdBoardSnapshot = null;
                clearInterval(boardCheckInterval);
                boardCheckInterval = null;
                console.log("[Tetris Hold Extension] 盤面の更新（ミノ固定）を検知。次ターンのホールドが可能になりました。");
            }
        } catch (e) {
            console.error("[Tetris Hold Extension] 盤面監視中にエラーが発生しました:", e);
        }
    }, 50);
}

/**
 * ホールド処理のロジック実行
 */
function executeHold() {
    if (hasHeldThisTurn) {
        console.log("[Tetris Hold Extension] このターンは既にホールドを行っています。");
        return;
    }

    let currentId = null;
    try {
        if (typeof _0x100317 !== 'undefined') {
            currentId = _0x100317;
        } else if (typeof window._0x100317 !== 'undefined') {
            currentId = window._0x100317;
        }
    } catch (e) {
        console.error("[Tetris Hold Extension] 変数 _0x100317 へのアクセスに失敗しました:", e);
        return;
    }

    if (currentId === null || currentId === undefined) {
        console.warn("[Tetris Hold Extension] ゲーム変数が初期化されていないか、見つかりません。ゲーム開始後に試してください。");
        return;
    }

    console.log("[Tetris Hold Extension] Hold実行中... 現在のミノID:", currentId);

    try {
        if (holdPieceId === null) {
            // 【最初のホールド時】
            holdPieceId = currentId;

            // 次のミノを取得
            const nextId = (typeof _0xdcb38e !== 'undefined') ? _0xdcb38e : window._0xdcb38e;

            // 今のミノを次のミノに変更
            if (typeof _0x100317 !== 'undefined') _0x100317 = nextId;
            try { window._0x100317 = nextId; } catch (e) {}

            const newCurrentShape = copyShape(TETRIS_PIECES[nextId].shape);
            if (typeof _0x235a17 !== 'undefined') _0x235a17 = newCurrentShape;
            try { window._0x235a17 = newCurrentShape; } catch (e) {}

            // 新しい「次のミノ」を1~7からランダムに選出 (元のネクスト nextId とは必ず異なるもの)
            let newNextId;
            do {
                newNextId = Math.floor(Math.random() * 7) + 1;
            } while (newNextId === nextId);

            // 次のミノIDを更新
            if (typeof _0xdcb38e !== 'undefined') _0xdcb38e = newNextId;
            try { window._0xdcb38e = newNextId; } catch (e) {}

            const newNextShape = copyShape(TETRIS_PIECES[newNextId].shape);
            if (typeof _0x39862e !== 'undefined') _0x39862e = newNextShape;
            try { window._0x39862e = newNextShape; } catch (e) {}

        } else {
            // 【2回目以降のホールド時】
            const tempId = currentId;
            const newCurrentId = holdPieceId;
            holdPieceId = tempId;

            if (typeof _0x100317 !== 'undefined') _0x100317 = newCurrentId;
            try { window._0x100317 = newCurrentId; } catch (e) {}

            const newCurrentShape = copyShape(TETRIS_PIECES[newCurrentId].shape);
            if (typeof _0x235a17 !== 'undefined') _0x235a17 = newCurrentShape;
            try { window._0x235a17 = newCurrentShape; } catch (e) {}
        }

        // ミノの出現位置を初期化 (X: 3, Y: 0)
        if (typeof _0x38e098 !== 'undefined') _0x38e098 = 3;
        try { window._0x38e098 = 3; } catch (e) {}

        if (typeof _0x3eda0c !== 'undefined') _0x3eda0c = 0;
        try { window._0x3eda0c = 0; } catch (e) {}

        // ホールドUI更新
        renderHoldPiece();

        // ネクスト画面を直接更新
        renderNextPiece();

        // ホールド成功効果音の再生
        playHoldSound();

        // 監視用フラグ・スナップショットを記録
        hasHeldThisTurn = true;
        const currentBoard = (typeof _0xbbda4e !== 'undefined') ? _0xbbda4e : window._0xbbda4e;
        if (currentBoard) {
            holdBoardSnapshot = JSON.stringify(currentBoard);
        }
        startBoardMonitoring();

        // ゲーム側の描画関数を呼び出し
        try {
            if (typeof _0x16eb65 === 'function') {
                _0x16eb65();
            } else if (typeof window._0x16eb65 === 'function') {
                window._0x16eb65();
            }
        } catch (drawErr) {
            console.warn("[Tetris Hold Extension] 即時描画関数の呼び出しに失敗しました:", drawErr);
        }

        console.log("[Tetris Hold Extension] ホールド成功! 現在ホールド中ID:", holdPieceId);

    } catch (err) {
        console.error("[Tetris Hold Extension] ホールド処理中にエラーが発生しました:", err);
    }
}

/**
 * 初期化処理
 */
function init() {
    createHoldUI();

    // キーボードイベントの捕捉 ('U' キーでホールド, 'R' キーでリセット, 'H+Space' でホームへ戻る際もリセット)
    window.addEventListener("keydown", function (e) {
        const key = e.code || e.key;
        activeKeys.add(key);

        const isHDown = activeKeys.has('KeyH') || activeKeys.has('h') || activeKeys.has('H') || activeKeys.has('ｈ');
        const isSpaceDown = activeKeys.has('Space') || activeKeys.has(' ');

        if (isHDown && isSpaceDown) {
            resetHold();
        }

        if (e.code === 'KeyU' || e.key === 'u' || e.key === 'U' || e.key === 'ｕ') {
            e.preventDefault();
            executeHold();
        } else if (e.code === 'KeyR' || e.key === 'r' || e.key === 'R' || e.key === 'ｒ') {
            resetHold();
        }
    }, true);

    window.addEventListener("keyup", function (e) {
        const key = e.code || e.key;
        activeKeys.delete(key);
    }, true);

    window.addEventListener("blur", function () {
        activeKeys.clear();
    });

    console.log("[Tetris Hold Extension] スクリプトが正常に読み込まれました。[U]キーでホールド、[R]キーおよび[H+Space]キーでホールドリセットが可能です。");
}

// ドキュメント読み込み後に初期化実行
if (document.readyState === "complete" || document.readyState === "interactive") {
    init();
} else {
    document.addEventListener("DOMContentLoaded", init);
}