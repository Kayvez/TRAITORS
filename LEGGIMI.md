# Tradimento al Collegio

Un gioco di inganni nel convento: Fedeli contro Traditrici. Da 4 a 12 giocatrici (più una narratrice opzionale).
Il tabellone va sull'iPad, ogni amica gioca dal suo telefono.

## Come si mette online (Render)
1. Su GitHub crea un repo nuovo (es. `tradimento`) e con "Add file → Upload files" carica TUTTI i file di questa cartella (non lo zip).
2. Su Render: New → Web Service → scegli il repo. Build command: vuoto. Start command: `node server.js`.
3. Apri `https://IL-TUO-NOME.onrender.com/board` sull'iPad. Le amiche scansionano il QR.

Facoltativo: per non perdere la partita se Render si riavvia, aggiungi le variabili `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` (le trovi nella sezione "REST API" del tuo database Upstash).

## In locale
`node server.js` e apri `/board` sull'iPad (stessa rete Wi-Fi).

## Come si gioca
Di notte le Traditrici eliminano una Fedele, di giorno c'è una missione sul telefono (fa crescere il premio e dà uno scudo segreto), poi la tavola rotonda: si discute e si vota chi bandire. Le Fedeli vincono se bandiscono tutte le Traditrici, le Traditrici se restano pari alle Fedeli.
Test: `node test.js`
