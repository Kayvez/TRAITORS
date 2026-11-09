(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TDATA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const TITLE = 'Tradimento al Collegio';
  // 13 sigilli di cera (12 giocatrici + la narratrice): ognuna sceglie il suo (simbolo + colore)
  const SEALS = [
    { id: 'candela', icon: '🕯️', color: '#d9a441', name: 'Candela' },
    { id: 'rosa', icon: '🌹', color: '#b3263f', name: 'Rosa' },
    { id: 'chiave', icon: '🗝️', color: '#8a7a3a', name: 'Chiave' },
    { id: 'luna', icon: '🌙', color: '#4a5fa8', name: 'Luna' },
    { id: 'pipistrello', icon: '🦇', color: '#5b3a78', name: 'Pipistrello' },
    { id: 'colomba', icon: '🕊️', color: '#6aa3b8', name: 'Colomba' },
    { id: 'specchio', icon: '🪞', color: '#3f8a86', name: 'Specchio' },
    { id: 'pergamena', icon: '📜', color: '#a8743a', name: 'Pergamena' },
    { id: 'giglio', icon: '⚜️', color: '#2f7a4f', name: 'Giglio' },
    { id: 'gufo', icon: '🦉', color: '#7a5a3a', name: 'Gufo' },
    { id: 'serpente', icon: '🐍', color: '#4c7a2a', name: 'Serpente' },
    { id: 'viola', icon: '🥀', color: '#8e3a6b', name: 'Fiore secco' },
    { id: 'campana', icon: '🔔', color: '#9a8a5a', name: 'Campana' },
  ];
  // domande per la missione "Quiz del refettorio": [domanda, [4 risposte], indice giusta]
  const QUIZ = [
    ['Qual è la capitale dell\'Australia?', ['Sydney', 'Canberra', 'Melbourne', 'Perth'], 1],
    ['Chi dipinse la Gioconda?', ['Raffaello', 'Michelangelo', 'Leonardo da Vinci', 'Caravaggio'], 2],
    ['Quanti lati ha un esagono?', ['5', '6', '7', '8'], 1],
    ['Qual è il fiume più lungo d\'Italia?', ['Tevere', 'Adige', 'Po', 'Arno'], 2],
    ['Quale pianeta è il più vicino al Sole?', ['Venere', 'Marte', 'Mercurio', 'Giove'], 2],
    ['Chi scrisse "I promessi sposi"?', ['Manzoni', 'Leopardi', 'Verga', 'Pascoli'], 0],
    ['Qual è la capitale del Portogallo?', ['Porto', 'Lisbona', 'Madrid', 'Faro'], 1],
    ['Quanti giorni ha un anno bisestile?', ['365', '364', '366', '367'], 2],
    ['Quale animale è il simbolo del WWF?', ['Tigre', 'Panda', 'Lupo', 'Orso polare'], 1],
    ['Chi scrisse la Divina Commedia?', ['Petrarca', 'Boccaccio', 'Dante', 'Ariosto'], 2],
    ['Qual è il simbolo chimico dell\'oro?', ['Or', 'Go', 'Ag', 'Au'], 3],
    ['Qual è il più grande oceano?', ['Atlantico', 'Pacifico', 'Indiano', 'Artico'], 1],
    ['Con quale ingrediente si fa il pesto?', ['Basilico', 'Prezzemolo', 'Rucola', 'Menta'], 0],
    ['In quale città si trova la Torre Pendente?', ['Siena', 'Lucca', 'Pisa', 'Livorno'], 2],
    ['Quale santo, secondo la tradizione, parlava agli uccelli?', ['San Antonio', 'San Francesco', 'San Pietro', 'San Benedetto'], 1],
    ['Quante sono le note musicali?', ['5', '6', '7', '8'], 2],
    ['Qual è la capitale del Giappone?', ['Kyoto', 'Osaka', 'Tokyo', 'Nagoya'], 2],
    ['Che colore si ottiene mescolando blu e giallo?', ['Verde', 'Arancione', 'Viola', 'Marrone'], 0],
    ['Quante sono le regioni italiane?', ['18', '19', '20', '21'], 2],
    ['Chi dipinse la volta della Cappella Sistina?', ['Raffaello', 'Michelangelo', 'Giotto', 'Tiziano'], 1],
    ['Quale mare bagna Venezia?', ['Tirreno', 'Ionio', 'Adriatico', 'Ligure'], 2],
    ['Qual è l\'animale terrestre più veloce?', ['Leone', 'Ghepardo', 'Cavallo', 'Gazzella'], 1],
    ['Quale vulcano sovrasta Napoli?', ['Etna', 'Stromboli', 'Vesuvio', 'Vulcano'], 2],
    ['Quanti minuti ci sono in un\'ora e mezza?', ['80', '90', '100', '120'], 1],
    ['Quale lingua si parla in Brasile?', ['Spagnolo', 'Portoghese', 'Inglese', 'Francese'], 1],
    ['Quanti anelli ci sono nel simbolo olimpico?', ['4', '5', '6', '7'], 1],
    ['Quale organo pompa il sangue?', ['Fegato', 'Polmone', 'Cuore', 'Rene'], 2],
    ['In che anno cadde il Muro di Berlino?', ['1979', '1985', '1989', '1991'], 2],
    ['Come si chiama il formaggio con i buchi?', ['Emmental', 'Gorgonzola', 'Pecorino', 'Parmigiano'], 0],
    ['Chi è l\'autore di "Pinocchio"?', ['De Amicis', 'Collodi', 'Rodari', 'Salgari'], 1],
    ['Quale pianeta è chiamato "il pianeta rosso"?', ['Marte', 'Venere', 'Saturno', 'Mercurio'], 0],
    ['Quanti tasti ha un pianoforte?', ['76', '82', '88', '96'], 2],
    ['Quanto fa 7 × 8?', ['54', '56', '58', '64'], 1],
    ['Qual è il mammifero più grande?', ['Elefante', 'Orca', 'Balenottera azzurra', 'Ippopotamo'], 2],
    ['Quale città ha il Duomo con la Madonnina?', ['Torino', 'Milano', 'Firenze', 'Bologna'], 1],
    ['Chi scrisse "Il nome della rosa"?', ['Calvino', 'Eco', 'Moravia', 'Levi'], 1],
    ['Qual è il libro sacro dei cristiani?', ['Corano', 'Torah', 'Bibbia', 'Veda'], 2],
    ['Quanti sono i giorni di febbraio in un anno normale?', ['27', '28', '29', '30'], 1],
    ['Di che colore è la clorofilla?', ['Rossa', 'Gialla', 'Verde', 'Blu'], 2],
    ['Quale città italiana è famosa per i canali e le gondole?', ['Ravenna', 'Venezia', 'Chioggia', 'Mantova'], 1],
  ];
  // missioni: durata in secondi
  const MISSIONS = {
    quiz: { icon: '📚', name: 'Quiz del refettorio', how: 'Rispondi a 5 domande il più in fretta possibile. Ogni risposta giusta aggiunge soldi al premio.', sec: 80 },
    memory: { icon: '🕯️', name: 'Le candele della cappella', how: 'Guarda la sequenza di candele che si accendono e ripetila. Vai avanti più che puoi!', sec: 75 },
    intruder: { icon: '🔍', name: 'Trova l\'intruso', how: 'In ogni griglia c\'è un simbolo diverso dagli altri: toccalo. Più ne trovi in 40 secondi, meglio è.', sec: 45 },
  };
  const RULES = [
    { icon: '🏰', t: 'Il convento nasconde dei Traditori', x: 'Tra voi ci sono delle Traditrici: si conoscono tra loro. Tutte le altre sono Fedeli. Il tuo ruolo lo vedi solo tu, sul telefono.', tip: 'Tieni il telefono coperto!' },
    { icon: '🌙', t: 'Di notte, il tradimento', x: 'Tutte chiudono gli occhi. Le Traditrici scelgono in segreto chi eliminare. Al mattino si scopre chi non c\'è più.', tip: 'Le Fedeli di notte non fanno niente.' },
    { icon: '🎯', t: 'Di giorno, la missione', x: 'Un mini-gioco sul telefono: ogni punto fa crescere il premio da dividere. Chi va meglio vince uno scudo segreto che la salva da un\'eliminazione notturna.', tip: 'Una Traditrice può sabotare di nascosto.' },
    { icon: '🗣️', t: 'La tavola rotonda', x: 'Si discute: di chi non vi fidate? Poi si vota, a turno e in pubblico. Chi ha più voti viene bandita e mostra il suo ruolo.', tip: 'Se c\'è un pareggio si rivota.' },
    { icon: '🏆', t: 'Come si vince', x: 'Le Fedeli vincono se bandiscono tutte le Traditrici e si dividono il premio. Le Traditrici vincono se restano in numero uguale alle Fedeli.', tip: 'Mentire è permesso. Anzi, è il gioco.' },
  ];
  return { TITLE, SEALS, QUIZ, MISSIONS, RULES };
});
