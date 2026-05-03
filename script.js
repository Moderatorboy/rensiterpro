const BASE_API = "https://renbotstream3.onrender.com/stream/";
const RAILWAY_BASE_API = "https://renbotstream-production.up.railway.app/stream/";
const LMS_API = "http://localhost:5000";

const AI_HANDLER_URL = window.location.hostname.includes('gatewayclass.netlify.app')
    ? '/.netlify/functions/netlify-gemini-handler'
    : '/api/vercel-gemini-handler';

let appState = {
    view: 'home',
    classId: null,
    batchIdx: null,
    chapterIdx: null,
    tab: 'videos',
    batchTab: 'all',
    chapTab: 'chapters',
    searchTerm: ''
};

let DB = {};
let favSubjects = JSON.parse(localStorage.getItem('favSubjects')) || [];
let favChapters = JSON.parse(localStorage.getItem('favChapters')) || [];

let renderWakeInterval = null;
let renderReady = false;
let currentChannelId = null;
let currentVidId = null;
let videoTimeTracker = null;

let navPingInterval = null;
let navPingDone = false;

async function loadDynamicClass(websiteName = "Rensiter") {
    try {
        const websites = await fetch(`${LMS_API}/api/websites`).then(r => r.json());
        const website = websites.find(w => w.name.toLowerCase() === websiteName.toLowerCase());
        if (!website) return [];

        const batches = await fetch(`${LMS_API}/api/batches?website_id=${website._id}`).then(r => r.json());
        const finalBatches = [];

        for (const batch of batches) {
            const subjects = await fetch(`${LMS_API}/api/subjects?batch_id=${batch._id}`).then(r => r.json());

            for (const subject of subjects) {
                const chapters = await fetch(`${LMS_API}/api/chapters?subject_id=${subject._id}`).then(r => r.json());
                const finalChapters = [];

                for (const chapter of chapters) {
                    const videos = await fetch(`${LMS_API}/api/contents?chapter_id=${chapter._id}&type=video`).then(r => r.json());
                    const notes = await fetch(`${LMS_API}/api/contents?chapter_id=${chapter._id}&type=notes`).then(r => r.json());
                    const sheets = await fetch(`${LMS_API}/api/contents?chapter_id=${chapter._id}&type=sheet`).then(r => r.json());

                    finalChapters.push({
                        chapter_name: chapter.name,
                        lectures: videos.map((v, i) => ({
                            lec_no: String(i + 1),
                            title: v.title,
                            video_id: v.message_id
                        })),
                        notes: notes.map(n => ({
                            title: n.title,
                            id: n.message_id
                        })),
                        sheets: sheets.map(s => ({
                            title: s.title,
                            id: s.message_id
                        }))
                    });
                }

                finalBatches.push({
                    batch_name: subject.name,
                    channel_id: batch.channel_id || "-1003851927851",
                    chapters: finalChapters,
                    study_material: []
                });
            }
        }

        return finalBatches;
    } catch (err) {
        console.log("Dynamic API load error:", err);
        return [];
    }
}
window.onload = async function() {
    DB = {
        '11':  { name: 'APNA COLLEGE',      batches: safeLoad('dataClass11','class11Data','batch11') },
        '12':  { name: 'Class 12th',         batches: safeLoad('dataClass12','class12Data','batch12') },
        '13':  { name: '1ST YEAR',           batches: safeLoad('dataClass13','class13Data','batch13') },
        '14':  { name: 'Dropshipping',           batches: safeLoad('dataClass14','class14Data','batch14') },
        '15':  { name: 'Jason Fedin',                batches: safeLoad('dataClass15','class15Data','batch15') },
        '17':  { name: 'DSA',                batches: safeLoad('dataClass17','class17Data','batch17') },
        '101': { name: 'CHAI CODE',          batches: safeLoad('dataClass101','class101Data','batch101') },
        '102': { name: 'SUPREME COURSE',     batches: safeLoad('dataClass102','class102Data','batch102') },
        '103': { name: 'WEDDING MASTERY',    batches: safeLoad('dataClass103','class103Data','batch103') },
        '104': { name: 'PROFESSOR OF HOW',   batches: safeLoad('dataClass104','class104Data','batch104') },
        '105': { name: 'PW SKILLS',          batches: safeLoad('dataClass105','class105Data','batch105') },
        '106': { name: 'Keerti Purswani HHLD',batches: safeLoad('dataClass106','class106Data','batch106') },
        '107': { name: 'Financial Modeling Fundamentals', batches: safeLoad('dataClass107','class107Data','batch107') },
        '108': { name: 'UDEMY', batches: safeLoad('dataClass108','class108Data','batch108') },
        '109': { name: 'TRADING', batches: safeLoad('dataClass109','class109Data','batch109') },
        '110': { name: 'DevOps', batches: safeLoad('dataClass110','class110Data','batch110') },
        '111': { name: 'HARKIRAT COHORT', batches: safeLoad('dataClass111','class111Data','batch111') },
        '112': { name: 'Shreyansh coding', batches: safeLoad('dataClass112','class112Data','batch112') },
        '113': { name: 'Campus', batches: safeLoad('dataClass113','class113Data','batch113') },
        '114': { name: 'CODE WITH HARRY', batches: safeLoad('dataClass114','class114Data','batch114') },
        '115': { name: 'ADCA', batches: safeLoad('dataClass115','class115Data','batch115') },
        '116': { name: 'INEURON', batches: safeLoad('dataClass116','class116Data','batch116') },
        '117': { name: 'B4U', batches: safeLoad('dataClass117','class117Data','batch117') },
        '201': { name: 'PW EARNERS', batches: safeLoad('dataClass201','class201Data','batch201') },
        '202': { name: 'AKTU 2ND YEAR', batches: safeLoad('dataClass202','class202Data','batch202') },
        '999': { name: 'BOT COURSES', batches: await loadDynamicClass("Rensiter") },
    };

    initTheme();
    initSearchListener();
    handleRouting();
    window.addEventListener('hashchange', handleRouting);
    setupPlayerModalControls();
    setTimeout(initDoubtSolver, 400);
    initKeepAlive();
    startNavPing();
};

function safeLoad(...names) {
    for (const n of names) {
        if (typeof window[n] !== 'undefined') return window[n];
    }
    return [];
}

/* ─── 4. HELPERS ─────────────────────────────────────── */
function getCompletedLectures() {
    return JSON.parse(localStorage.getItem('completed_lectures') || '[]');
}

function toggleLectureComplete(lecId) {
    if (!lecId) return;
    let list = getCompletedLectures();
    const idx = list.indexOf(lecId);
    if (idx === -1) list.push(lecId); else list.splice(idx, 1);
    localStorage.setItem('completed_lectures', JSON.stringify(list));

    if (appState.view === 'player') {
        const chapter = DB[appState.classId].batches[appState.batchIdx].chapters[appState.chapterIdx];
        renderResources(chapter);
    }
}

function getBatchStats(batch) {
    let total = 0, done = 0;
    const completed = getCompletedLectures();
    (batch.chapters || []).forEach(ch => {
        (ch.lectures || []).forEach(l => {
            total++;
            if (l.video_id && completed.includes(l.video_id.toString())) done++;
        });
    });
    return {
        chapters: (batch.chapters || []).length,
        lectures: total,
        completed: done,
        percent: total > 0 ? Math.round((done / total) * 100) : 0
    };
}

function toggleBookmark(event, id, type) {
    event.stopPropagation();
    const btn  = event.currentTarget;
    const key  = type === 'subject' ? 'favSubjects' : 'favChapters';
    const list = type === 'subject' ? favSubjects   : favChapters;

    const idx = list.indexOf(id);
    if (idx === -1) list.push(id); else list.splice(idx, 1);
    localStorage.setItem(key, JSON.stringify(list));

    const isFav = list.includes(id);
    btn.classList.toggle('active', isFav);
    btn.innerHTML = `<i class="${isFav ? 'ri-heart-fill' : 'ri-heart-line'}"></i>`;

    if (appState.batchTab === 'fav' || appState.chapTab === 'fav') {
        type === 'subject' ? renderBatches() : renderChapters();
    }
}

function getSubjectIcon(name) {
    const n = name.toLowerCase();
    if (n.includes('physics'))     return { text:'PHY', color:'#3b82f6' };
    if (n.includes('programming')) return { text:'PPS', color:'#f59e0b' };
    if (n.includes('chemistry'))   return { text:'CHE', color:'#10b981' };
    if (n.includes('ecology'))     return { text:'ECO', color:'#10b981' };
    if (n.includes('zoology'))     return { text:'ZOO', color:'#8b5cf6' };
    if (n.includes('maths') || n.includes('math')) return { text:'MAT', color:'#ef4444' };
    if (n.includes('soft'))        return { text:'SOFT', color:'#f59e0b' };
    if (n.includes('dsa'))         return { text:'DSA', color:'#8b5cf6' };
    if (n.includes('sigma') || n.includes('web')) return { text:'WD', color:'#22c55e' };
    if (n.includes('engg') || n.includes('engineering')) return { text:'ENG', color:'#f59e0b' };
    if (n.includes('electrical'))  return { text:'ELE', color:'#f59e0b' };
    if (n.includes('electronics')) return { text:'ECT', color:'#3b82f6' };
    if (n.includes('mechanical'))  return { text:'MEC', color:'#ef4444' };
    if (n.includes('crash'))       return { text:'CC',  color:'#a855f7' };
    if (n.includes('ai'))          return { text:'AI',  color:'#a855f7' };
    if (n.includes('beast'))       return { text:'BG',  color:'#a855f7' };
    if (n.includes('wedding'))     return { text:'WED', color:'#3b82f6' };
    if (n.includes('how'))         return { text:'HOW', color:'#3b82f6' };
    if (n.includes('jp'))          return { text:'JP',  color:'#3b82f6' };
    if (n.includes('gb'))          return { text:'GB',  color:'#f59e0b' };
    if (n.includes('pw'))          return { text:'PW',  color:'#f59e0b' };
    if (n.includes('ADCA'))          return { text:'ADCA',  color:'#f59e0b' };
    if (n.includes('supreme course')) return { text:'SC', color:'#f59e0b' };
    if (n.includes('B4U')) return { text:'B4U', color:'#f59e0b' };
    return { text:'OT', color:'#10b981' };
}

/* ─── 5. ROUTING ─────────────────────────────────────── */
function updateURL(hash) {
    window.location.hash = hash;
}

document.getElementById('back-btn').onclick = () => {
    if (appState.view === 'player') {
        stopAndResetPlayer();
        updateURL(`/class/${appState.classId}/batch/${appState.batchIdx}`);
        return;
    }
    if (appState.view === 'chapters') {
        updateURL(`/class/${appState.classId}`);
        return;
    }
    if (appState.view === 'batches' && appState.classId?.startsWith('allen-')) {
        updateURL('allen-menu');
        return;
    }
    updateURL('/');
};

function handleRouting() {
    const hash  = window.location.hash.slice(1);
    const parts = hash.split('/');

    const sBox = document.getElementById('global-search');
    if (document.activeElement !== sBox) {
        sBox.value          = '';
        appState.searchTerm = '';
    }

    document.getElementById('video-player-modal').classList.add('hidden');
    document.getElementById('nav-controls').classList.remove('hidden');

    if (hash === 'allen-menu') { renderAllenMenu(); return; }
    if (!hash || hash === '/') { renderHome();      return; }

    if (parts[1] === 'class' && !parts[3]) {
        appState.classId  = parts[2];
        appState.view     = 'batches';
        if (appState.batchTab !== 'fav') appState.batchTab = 'all';
        startNavPing();
        renderBatches();
        return;
    }

    if (parts[1] === 'class' && parts[3] === 'batch' && !parts[5]) {
        appState.classId  = parts[2];
        appState.batchIdx = parseInt(parts[4]);
        appState.view     = 'chapters';
        appState.chapTab  = 'chapters';
        startNavPing();
        renderChapters();
        return;
    }

    if (parts[1] === 'class' && parts[3] === 'batch' && parts[5] === 'chapter') {
        appState.classId    = parts[2];
        appState.batchIdx   = parseInt(parts[4]);
        appState.chapterIdx = parseInt(parts[6]);
        appState.view       = 'player';
        startNavPing();
        renderPlayerView();
        restoreVideoAfterReload();
        return;
    }
}

/* ─── 6. SEARCH ──────────────────────────────────────── */
function initSearchListener() {
    const input = document.getElementById('global-search');
    if (!input) return;
    input.addEventListener('input', e => {
        const term = e.target.value.toLowerCase().trim();
        appState.searchTerm = term;

        if (appState.view === 'home') {
            term ? renderGlobalSearch(term) : renderHome();
        } else if (appState.view === 'batches')  { renderBatches(); }
        else if (appState.view === 'chapters')   { renderChapters(); }
        else if (appState.view === 'player') {
            const chapter = DB[appState.classId].batches[appState.batchIdx].chapters[appState.chapterIdx];
            renderResources(chapter);
        }
    });
}

function renderGlobalSearch(term) {
    const main = document.getElementById('main-content');
    let html = `<div class="grid-layout">`;
    let found = false;

    Object.keys(DB).forEach(cId => {
        (DB[cId]?.batches || []).forEach((b, idx) => {
            if (b.batch_name.toLowerCase().includes(term)) {
                found = true;
                const design = getSubjectIcon(b.batch_name);
                html += `
                    <div class="card" onclick="updateURL('/class/${cId}/batch/${idx}')">
                        <div class="card-img" style="height:120px; background:var(--bg-elevated); display:flex; flex-direction:column; align-items:center; justify-content:center; position:relative;">
                            <span style="position:absolute; top:8px; right:8px; background:var(--accent-subtle); color:var(--accent-text); padding:2px 8px; border-radius:var(--radius-pill); font-size:0.65rem; font-weight:700; letter-spacing:0.06em;">${cId.toUpperCase()}</span>
                            <div style="font-size:2.2rem; font-weight:900; color:${design.color}; font-family:var(--font-display);">${design.text}</div>
                        </div>
                        <div class="card-body">
                            <div class="card-title">${b.batch_name}</div>
                        </div>
                    </div>`;
            }
        });
    });

    html += `</div>`;
    main.innerHTML = found ? html : `
        <div class="empty-state">
            <i class="ri-search-line empty-icon"></i>
            <p>No results for "<strong>${term}</strong>"</p>
        </div>`;
}

/* ─── 7. HOME ────────────────────────────────────────── */
function renderHome() {
    appState.view = 'home';
    document.getElementById('nav-controls').classList.add('hidden');

    const sBox = document.getElementById('global-search');
    if (sBox) { sBox.placeholder = "Search batches, chapters..."; sBox.value = ''; }

    document.getElementById('main-content').innerHTML = `
        <div class="grid-layout" style="max-width:900px; margin:40px auto 0;">
            <div class="card class-card" onclick="updateURL('/class/13')">
                 <div class="card-img" style="height:160px; overflow:hidden; padding:0;">
        <img src="image/gw.jpg" alt="" style="width:100%; height:100%; object-fit:cover; display:block;">
    </div>
                <div class="card-body">
                    <div class="card-title">GATEWAY — 1ST YEAR</div>
                    <div class="card-meta">GATEWAY<i class="ri-book-open-line"></i> Engineering Subjects</div>
                </div>
            </div>

            <div class="card class-card" onclick="updateURL('/class/202')">
                 <div class="card-img" style="height:160px; overflow:hidden; padding:0;">
        <img src="image/gw.jpg" alt="" style="width:100%; height:100%; object-fit:cover; display:block;">
    </div>
                <div class="card-body">
                    <div class="card-title">GATEWAY — 2ND YEAR</div>
                    <div class="card-meta">GATEWAY<i class="ri-book-open-line"></i> Engineering Subjects</div>
                </div>
            </div>

            <div class="card class-card" onclick="updateURL('/class/11')">
                 <div class="card-img" style="height:160px; overflow:hidden; padding:0;">
        <img src="image/college.jpg" alt="APNA COLLEGE" style="width:100%; height:100%; object-fit:contain; display:block;">
    </div>
                <div class="card-body">
                    <div class="card-title">APNA COLLEGE</div>
                    <div class="card-meta"><i class="ri-graduation-cap-line"></i> BY SHRADHA KHAPRA</div>
                </div>
            </div>

            <div class="card class-card" onclick="updateURL('/class/101')">
                <div class="card-img" style="height:160px; overflow:hidden; padding:0; background:#000;">
    <img src="image/chai.jpg" alt="CHAI CODE" style="width:100%; height:100%; object-fit:contain; display:block;">
</div>
                <div class="card-body">
                    <div class="card-title">CHAI CODE</div>
                    <div class="card-meta"><i class="ri-graduation-cap-line"></i> BY HITESH CHOUDHARY</div>
                </div>
            </div>

            <div class="card class-card" onclick="updateURL('/class/102')">
                 <div class="card-img" style="height:160px; overflow:hidden; padding:0;">
        <img src="image/supreme.jpg" alt="SUPREME" style="width:100%; height:100%; object-fit:contain; display:block;">
    </div>
                <div class="card-body">
                    <div class="card-title">SUPREME 3.0</div>
                    <div class="card-meta"><i class="ri-graduation-cap-line"></i> BY LOVE BABBAR</div>
                </div>
            </div>

            <div class="card class-card" onclick="updateURL('/class/103')">
                 <div class="card-img" style="height:160px; overflow:hidden; padding:0;">
        <img src="image/rajaa.jpg" alt="RAJA AWASTHI" style="width:100%; height:100%; object-fit:cover; display:block;">
    </div>
                <div class="card-body">
                    <div class="card-title">WEDDING MASTER BUNDLE</div>
                    <div class="card-meta"><i class="ri-graduation-cap-line"></i> BY RAJA AWASTHI</div>
                </div>
            </div>

            <div class="card class-card" onclick="updateURL('/class/104')">
                <div class="card-img" style="height:160px; overflow:hidden; padding:0;">
        <img src="image/poh.png" alt="PROFESSOR OF HOW 3D" style="width:100%; height:100%; object-fit:cover; display:block;">
    </div>
                <div class="card-body">
                    <div class="card-title">PROFESSOR OF HOW 3D</div>
                    <div class="card-meta"><i class="ri-graduation-cap-line"></i> BY KISHOR NARUKA</div>
                </div>
            </div>

            <div class="card class-card" onclick="updateURL('/class/105')">
                <div class="card-img" style="height:160px; overflow:hidden; padding:0;">
        <img src="image/pwskill.jpg" alt="PW SKILLS" style="width:100%; height:100%; object-fit:cover; display:block;">
    </div>
                <div class="card-body">
                    <div class="card-title">PW SKILLS</div>
                    <div class="card-meta"><i class="ri-graduation-cap-line"></i> BY PW TEAMS</div>
                </div>
            </div>

            <div class="card class-card" onclick="updateURL('/class/106')">
                <div class="card-img" style="height:160px; overflow:hidden; padding:0;">
        <img src="image/keerti.jpg" alt="Keerti Purswani" style="width:100%; height:100%; object-fit:contain; display:block;">
    </div>
                <div class="card-body">
                    <div class="card-title">Keerti Purswani</div>
                    <div class="card-meta"><i class="ri-graduation-cap-line"></i> BY Keerti Purswani</div>
                </div>
            </div>

            <div class="card class-card" onclick="updateURL('/class/107')">
                <div class="card-img" style="height:160px; overflow:hidden; padding:0;">
        <img src="image/fmf.jpg" alt="Financial Modeling Fundamentals" style="width:100%; height:100%; object-fit:contain; display:block;">
    </div>
                <div class="card-body">
                    <div class="card-title">Financial Modeling Fundamentals</div>
                    <div class="card-meta"><i class="ri-graduation-cap-line"></i> BY Josh Aharonoff</div>
                </div>
            </div>

            <div class="card class-card" onclick="updateURL('/class/108')">
                <div class="card-img" style="height:160px; overflow:hidden; padding:0;">
        <img src="image/udemy.jpg" alt="UDEMY" style="width:100%; height:100%; object-fit:contain; display:block;">
    </div>
                <div class="card-body">
                    <div class="card-title">UDEMY</div>
                    <div class="card-meta"><i class="ri-graduation-cap-line"></i> BY UDEMY TEAM</div>
                </div>
            </div>

            <div class="card class-card" onclick="updateURL('/class/109')">
    <div class="card-img" style="height:160px; overflow:hidden; padding:0;">
        <img src="image/trading.jpg" alt="TRADING" style="width:100%; height:100%; object-fit:contain; display:block;">
    </div>
    <div class="card-body">
        <div class="card-title">TRADING</div>
        <div class="card-meta"><i class="ri-graduation-cap-line"></i> BY TRADING TEAM</div>
                </div>
            </div>

            <div class="card class-card" onclick="updateURL('/class/110')">
    <div class="card-img" style="height:160px; overflow:hidden; padding:0;">
        <img src="image/devops.png" alt="PW SKILLS" style="width:100%; height:100%; object-fit:contain; display:block;">
    </div>
    <div class="card-body">
        <div class="card-title">DEVELOPMENT OPERATIONS</div>
        <div class="card-meta"><i class="ri-graduation-cap-line"></i> BY SINGAM4DEVOPS</div>
                </div>
            </div>

            <div class="card class-card" onclick="updateURL('/class/111')">
    <div class="card-img" style="height:160px; overflow:hidden; padding:0;">
        <img src="image/cohort.jpg" alt="HARKIRAT COHORT" style="width:100%; height:100%; object-fit:contain; display:block;">
    </div>
    <div class="card-body">
        <div class="card-title">HARKIRAT COHORT</div>
        <div class="card-meta"><i class="ri-graduation-cap-line"></i> BY HARKIRAT COHORT</div>
                </div>
            </div>

            <div class="card class-card" onclick="updateURL('/class/112')">
    <div class="card-img" style="height:160px; overflow:hidden; padding:0;">
        <img src="image/Shreyansh.webp" alt="Shreyansh coding" style="width:100%; height:100%; object-fit:contain; display:block;">
    </div>
    <div class="card-body">
        <div class="card-title">Shreyansh coding</div>
        <div class="card-meta"><i class="ri-graduation-cap-line"></i> BY Shreyansh coding</div>
                </div>
            </div>

            <div class="card class-card" onclick="updateURL('/class/113')">
    <div class="card-img" style="height:160px; background:linear-gradient(135deg, #0f172a, #1e3a5f); display:flex; align-items:center; justify-content:center;">
        <i class="ri-terminal-box-line" style="font-size:3.5rem; color:#38bdf8;"></i>
    </div>
    <div class="card-body">
        <div class="card-title">Campus</div>
        <div class="card-meta"><i class="ri-graduation-cap-line"></i> BY Campus</div>
                </div>
            </div>

            <div class="card class-card" onclick="updateURL('/class/114')">
     <div class="card-img" style="height:160px; overflow:hidden; padding:0;">
        <img src="image/harry.jpg" alt="CODE WITH HARRY" style="width:100%; height:100%; object-fit:contain; display:block;">
    </div>
    <div class="card-body">
        <div class="card-title">CODE WITH HARRY</div>
        <div class="card-meta"><i class="ri-graduation-cap-line"></i> BY Haris Ali Khan</div>
                </div>
            </div>

            <div class="card class-card" onclick="updateURL('/class/115')">
    <div class="card-img" style="height:160px; overflow:hidden; padding:0;">
        <img src="image/adca.jpg" alt="ADCA" style="width:100%; height:100%; object-fit:cover; display:block;">
    </div>
    <div class="card-body">
        <div class="card-title">ADVANCE DIPLOMA IN COMPUTER APPLICATION</div>
        <div class="card-meta"><i class="ri-graduation-cap-line"></i> BY SATISH DHAWALE</div>
                </div>
            </div>

            <div class="card class-card" onclick="updateURL('/class/116')">
    <div class="card-img" style="height:160px; overflow:hidden; padding:0;">
        <img src="image/ineuron.jpg" alt="INEURON" style="width:100%; height:100%; object-fit:cover; display:block;">
    </div>
    <div class="card-body">
        <div class="card-title">INEURON</div>
        <div class="card-meta"><i class="ri-graduation-cap-line"></i> BY INEURON TEAM</div>
                </div>
            </div>

            <div class="card class-card" onclick="updateURL('/class/201')">
    <div class="card-img" style="height:160px; overflow:hidden; padding:0;">
        <img src="image/EARNERS.jpg" alt="PW Earners" style="width:100%; height:100%; object-fit:cover; display:block;">
    </div>
    <div class="card-body">
        <div class="card-title">PW EARNERS</div>
        <div class="card-meta"><i class="ri-graduation-cap-line"></i> BY PW EARNERS TEAMS</div>
                </div>
            </div>

            <div class="card class-card" onclick="updateURL('/class/14')">
    <div class="card-img" style="height:160px; overflow:hidden; padding:0;">
        <img src="image/dropshipping.jpg" alt="Dropshipping" style="width:100%; height:100%; object-fit:contain; display:block;">
    </div>
    <div class="card-body">
        <div class="card-title">Vivek Bindra</div>
        <div class="card-meta"><i class="ri-graduation-cap-line"></i> BY Vivek Bindra TEAMS</div>
                </div>
            </div>

            <div class="card class-card" onclick="updateURL('/class/15')">
    <div class="card-img" style="height:160px; overflow:hidden; padding:0;">
        <img src="image/jasonfedin.jpg" alt="Jason Fedin" style="width:100%; height:100%; object-fit:contain; display:block;">
    </div>
    <div class="card-body">
        <div class="card-title">Learn Programming</div>
        <div class="card-meta"><i class="ri-graduation-cap-line"></i> BY Jason Fedin</div>
                </div>
            </div>

            <div class="card class-card" onclick="updateURL('/class/999')">
    <div class="card-img" style="height:160px; display:flex; align-items:center; justify-content:center; background:#111;">
        <i class="ri-database-2-line" style="font-size:4rem; color:#a78bfa;"></i>
    </div>
    <div class="card-body">
        <div class="card-title">BOT COURSES</div>
        <div class="card-meta"><i class="ri-cloud-line"></i> Telegram Bot Data</div>
    </div>
</div>
        </div>`;
}

/* ─── 9. BATCHES VIEW ────────────────────────────────── */
function renderBatches() {
    const main = document.getElementById('main-content');
    if (!appState.classId || !DB[appState.classId]) {
        main.innerHTML = `<div class="empty-state"><p>Please select a class first.</p></div>`;
        return;
    }

    const currentClass = DB[appState.classId];
    document.getElementById('current-path').innerText = currentClass.name;

    const batches  = currentClass.batches || [];
    const term     = appState.searchTerm;
    let filtered   = batches.filter(b => b.batch_name.toLowerCase().includes(term));

    if (appState.batchTab === 'fav') {
        filtered = filtered.filter((b) => {
            const origIdx = batches.indexOf(b);
            return favSubjects.includes(`${appState.classId}-${origIdx}`);
        });
    }

    let html = `
        <div class="batch-tabs">
            <button class="batch-tab ${appState.batchTab !== 'fav' ? 'active' : ''}" onclick="switchBatchTab('all')">All Subjects</button>
            <button class="batch-tab ${appState.batchTab === 'fav' ? 'active' : ''}" onclick="switchBatchTab('fav')">Favorites ❤️</button>
        </div>
        <div id="batch-container">`;

    if (filtered.length === 0) {
        html += `<div class="empty-state"><i class="ri-heart-3-line empty-icon"></i><p>${appState.batchTab === 'fav' ? 'No bookmarked subjects yet.' : 'No subjects found.'}</p></div>`;
    } else {
        filtered.forEach(batch => {
            const origIdx  = batches.indexOf(batch);
            const stats    = getBatchStats(batch);
            const style    = getSubjectIcon(batch.batch_name);
            const cardId   = `${appState.classId}-${origIdx}`;
            const isFav    = favSubjects.includes(cardId);

            html += `
                <div class="subject-card-list" onclick="updateURL('/class/${appState.classId}/batch/${origIdx}')">
                    <div class="sub-icon-box" style="color:${style.color}; border-color:${style.color}40;">${style.text}</div>
                    <div class="sub-info">
                        <div class="sub-title">${batch.batch_name}</div>
                        <div class="sub-meta">${stats.chapters} Chapters &bull; ${stats.completed}/${stats.lectures} Done</div>
                    </div>
                    <div class="sub-progress">
                        <div class="prog-bg">
                            <div class="prog-fill" style="width:${stats.percent}%; background:${style.color};"></div>
                        </div>
                    </div>
                    <div class="bookmark-btn ${isFav ? 'active' : ''}" onclick="toggleBookmark(event,'${cardId}','subject')">
                        <i class="${isFav ? 'ri-heart-fill' : 'ri-heart-line'}"></i>
                    </div>
                </div>`;
        });
    }

    html += `</div>`;
    main.innerHTML = html;
}

function switchBatchTab(tab) {
    appState.batchTab = tab;
    renderBatches();
}

/* ─── 10. CHAPTERS VIEW ──────────────────────────────── */
function renderChapters() {
    const main = document.getElementById('main-content');
    if (!appState.classId || appState.batchIdx === null) return;

    const batch    = DB[appState.classId].batches[appState.batchIdx];
    const chapters = batch.chapters || [];
    const term     = appState.searchTerm;
    const completed= getCompletedLectures();

    document.getElementById('current-path').innerText = `${DB[appState.classId].name} › ${batch.batch_name}`;
    document.getElementById('global-search').placeholder = `Search chapters...`;

    let filtered = chapters.filter(c => c.chapter_name.toLowerCase().includes(term));

    if (appState.chapTab === 'fav') {
        filtered = filtered.filter(chap => {
            const origIdx = chapters.indexOf(chap);
            return favChapters.includes(`${appState.classId}-${appState.batchIdx}-${origIdx}`);
        });
    }

    let html = `
        <div class="batch-tabs">
            <button class="batch-tab ${appState.chapTab === 'chapters' ? 'active' : ''}" onclick="switchChapterTab('chapters')">Chapters</button>
            <button class="batch-tab ${appState.chapTab === 'fav' ? 'active' : ''}" onclick="switchChapterTab('fav')">Favorites ❤️</button>
            <button class="batch-tab ${appState.chapTab === 'material' ? 'active' : ''}" onclick="switchChapterTab('material')">Study Material</button>
        </div>
        <div id="chapters-content">`;

   if (appState.chapTab === 'material') {
    const channelId = batch.channel_id || "-1003637459451";
    const files     = batch.study_material || [];

    if (files.length === 0) {
        html += `<div class="empty-state"><i class="ri-folder-open-line empty-icon"></i><p>No Study Material Uploaded Yet.</p></div>`;
    } else {
        html += `<div style="padding:12px 16px; display:flex; flex-direction:column; gap:6px;">`;
        files.forEach((file, index) => {
            html += `
                <div class="resource-item">
                    <div class="res-left">
                        <i class="ri-file-text-line" style="font-size:1.4rem; color:var(--text-3); flex-shrink:0;"></i>
                        <div class="res-info">
                            <div style="display:flex; align-items:flex-start; gap:10px; flex-wrap:wrap;">
                                <span style="font-family:var(--font-display); font-size:0.7rem; font-weight:800; letter-spacing:0.08em; color:var(--accent-text); background:var(--accent-subtle); padding:3px 8px; border-radius:4px; white-space:nowrap; flex-shrink:0;">DOC — ${String(index + 1).padStart(2, '0')}</span>
                                <span style="white-space:normal; word-break:break-word; line-height:1.4; flex:1;">${file.title}</span>
                            </div>
                            <div style="font-size:0.75rem; color:var(--text-2); margin-top:5px;">PDF Document</div>
                        </div>
                    </div>
                    <div class="res-buttons">
                        <button class="btn-small" onclick="openPDF('${channelId}','${file.file_id}')">
                            <i class="ri-eye-line"></i> View
                        </button>
                    </div>
                </div>`;
        });
        html += `</div>`;
    }
} else if (filtered.length === 0) {
        html += `<div class="empty-state"><i class="ri-book-mark-line empty-icon"></i><p>${appState.chapTab === 'fav' ? 'No bookmarked chapters.' : 'No chapters found.'}</p></div>`;
    } else {
        html += `<div class="grid-layout">`;
        filtered.forEach(chap => {
            const origIdx   = chapters.indexOf(chap);
            const chapId    = `${appState.classId}-${appState.batchIdx}-${origIdx}`;
            const isFav     = favChapters.includes(chapId);
            const lecCount  = (chap.lectures || []).length;
            let doneCount   = 0;
            (chap.lectures || []).forEach(l => {
                if (l.video_id && completed.includes(l.video_id.toString())) doneCount++;
            });

            html += `
                <div class="card chapter-card" onclick="updateURL('/class/${appState.classId}/batch/${appState.batchIdx}/chapter/${origIdx}')">
                    <div class="bookmark-btn ${isFav ? 'active' : ''}" onclick="toggleBookmark(event,'${chapId}','chapter')">
                        <i class="${isFav ? 'ri-heart-fill' : 'ri-heart-line'}"></i>
                    </div>
                    <div class="card-body">
                        <div>
                            <div class="chapter-tag">CH — ${String(origIdx+1).padStart(2,'0')}</div>
                            <div class="card-title">${chap.chapter_name}</div>
                        </div>
                        <div class="lecture-status">
                            <span><i class="ri-play-circle-line"></i> ${lecCount} Lectures</span>
                            <span style="color:var(--accent-text); font-weight:600;">${doneCount}/${lecCount} Done</span>
                        </div>
                    </div>
                </div>`;
        });
        html += `</div>`;
    }

    html += `</div>`;
    main.innerHTML = html;
}

function switchChapterTab(tab) {
    appState.chapTab = tab;
    renderChapters();
}

/* ─── 11. PLAYER VIEW (Split Layout) ────────────────── */
function restoreVideoAfterReload() {
    try {
        const saved = sessionStorage.getItem('last_opened_video');
        if (!saved) return;
        const state = JSON.parse(saved);
        if (!state || state.classId !== appState.classId || state.batchIdx !== appState.batchIdx || state.chapterIdx !== appState.chapterIdx) return;
        if (!state.videoId) return;
        openPlayer(state.channelId || state.classId, state.videoId, state.title || 'Lecture');
        const savedTime = state.currentTime || 0;
        if (savedTime > 0) {
            player.once('loadedmetadata', () => {
                try {
                    player.currentTime = savedTime;
                } catch (e) {}
            });
        }
    } catch (e) {
        console.warn('Could not restore video after reload', e);
    }
}

function renderPlayerView() {
    const batch   = DB[appState.classId].batches[appState.batchIdx];
    const chapter = batch.chapters[appState.chapterIdx];
    document.getElementById('current-path').innerText = `${batch.batch_name} › ${chapter.chapter_name}`;
    document.getElementById('global-search').placeholder = `Search content...`;

    document.getElementById('main-content').innerHTML = `
        <div class="chapter-container">
            <div class="chapter-sidebar">
                <div class="sidebar-header">Unit List</div>
                <div class="sidebar-list">
                    ${batch.chapters.map((c, i) => `
                        <div class="chapter-list-item ${i === appState.chapterIdx ? 'active' : ''}"
                             onclick="updateURL('/class/${appState.classId}/batch/${appState.batchIdx}/chapter/${i}')">
                            ${i+1}. ${c.chapter_name}
                        </div>`).join('')}
                </div>
            </div>
            <div class="chapter-content-area">
                <div class="content-header">
                    <div class="tabs">
                        <div class="tab ${appState.tab==='videos' ? 'active':''}" onclick="setTab('videos')">Videos</div>
                        <div class="tab ${appState.tab==='notes'  ? 'active':''}" onclick="setTab('notes')">Notes</div>
                        <div class="tab ${appState.tab==='dpps'   ? 'active':''}" onclick="setTab('dpps')">DPPs</div>
                        <div class="tab ${appState.tab==='sheets' ? 'active':''}" onclick="setTab('sheets')">Sheets</div>
                    </div>
                </div>
                <div id="content-list-container"></div>
            </div>
        </div>`;

    renderResources(chapter);

    setTimeout(() => {
        document.querySelector('.chapter-list-item.active')
            ?.scrollIntoView({ block:'center', behavior:'smooth' });
    }, 150);
}

function setTab(tab) {
    appState.tab = tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => {
        if (t.textContent.toLowerCase().startsWith(tab.slice(0,3))) t.classList.add('active');
    });
    const chapter = DB[appState.classId].batches[appState.batchIdx].chapters[appState.chapterIdx];
    renderResources(chapter);
}

/* ─── 12. RENDER RESOURCES ───────────────────────────── */
function renderResources(chapter) {
    const container = document.getElementById('content-list-container');
    if (!container) return;
    container.innerHTML = '';

    const batch     = DB[appState.classId].batches[appState.batchIdx];
    const channelID = batch.channel_id || "-1003345907635";
    const type      = appState.tab;
    const term      = appState.searchTerm;
    const completed = getCompletedLectures();

    let data = [];
    if      (type === 'videos') data = chapter.lectures || [];
    else if (type === 'dpps')   data = chapter.dpps     || [];
    else if (type === 'sheets') data = chapter.sheets   || [];
    else if (type === 'notes') {
        data = chapter.notes || [];
        if (data.length === 0) {
            (chapter.lectures || []).forEach(l => {
                if (l.notes_id) data.push({ title: l.title + " (Notes)", id: l.notes_id });
            });
        }
    }

    const filtered = data.filter(item => {
        const name = item.title || item.name || `Lecture ${item.lec_no}`;
        return name.toLowerCase().includes(term);
    });

    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="ri-search-eye-line empty-icon"></i><p>No content found.</p></div>`;
        return;
    }

    filtered.forEach((item, index) => {
        const title = item.title || item.name || `Lecture ${item.lec_no}`;
        const row   = document.createElement('div');
        row.className = 'resource-item';

        if (type === 'videos') {
            const vidId  = item.video_id?.toString() || null;
            const isDone = vidId && completed.includes(vidId);

            const playBtn = item.video_id
                ? `<button class="btn-small play-btn" onclick="openPlayer('${channelID}','${item.video_id}','${escapeAttr(title)}')"><i class="ri-play-fill"></i> Play</button>`
                : `<span style="font-size:0.78rem; color:var(--text-3);">No Video</span>`;

           const pdfBtn = item.notes_id
    ? `<button class="btn-small" onclick="openPDF('${channelID}','${item.notes_id}')">PDF</button>`
    : '';

const suggestBtn = item.link
    ? `<button class="btn-small" onclick="window.open('${item.link}','_blank')" style="background:rgba(255,0,0,0.15); border-color:rgba(255,0,0,0.3); color:#f87171;"><i class="ri-youtube-line"></i> Ref</button>`
    : '';

            const checkBtn = vidId ? `
                <div class="mark-done" onclick="toggleLectureComplete('${vidId}')" title="Mark as done"
                     style="color:${isDone ? 'var(--green)' : 'var(--text-3)'};">
                    <i class="${isDone ? 'ri-checkbox-circle-fill' : 'ri-checkbox-blank-circle-line'}"></i>
                </div>` : '';

            // ── FIX 1: Full title (no truncation) + FIX 2: Duration badge ──
            row.innerHTML = `
                <div class="res-left">
                    ${checkBtn}
                    <div class="res-info">
                        <div style="display:flex; align-items:flex-start; gap:10px; flex-wrap:wrap;">
                            <span style="font-family:var(--font-display); font-size:0.7rem; font-weight:800; letter-spacing:0.08em; color:var(--accent-text); background:var(--accent-subtle); padding:3px 8px; border-radius:4px; white-space:nowrap; flex-shrink:0;">LEC — ${String(index + 1).padStart(2, '0')}</span>
                            <span style="white-space:normal; word-break:break-word; line-height:1.4; flex:1;">${title}</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px; margin-top:5px;">
                            <span style="font-size:0.75rem; color:var(--text-2);">Video Lecture</span>
                            ${vidId ? `<span id="dur-${vidId}" style="font-size:0.72rem; color:var(--accent-text); background:var(--accent-subtle); padding:1px 8px; border-radius:20px; opacity:0; transition:opacity 0.4s; font-variant-numeric:tabular-nums;"></span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="res-buttons">${playBtn}${pdfBtn}${suggestBtn}</div>`;

            // Duration async fetch
            if (vidId) {
                fetchAndShowDuration(vidId, channelID);
            }

        } else {
            const id        = item.id || item.notes_id;
            const icon      = (type === 'dpps' || type === 'sheets') ? 'ri-test-tube-line' : 'ri-file-text-line';
            const viewBtn   = `<button class="btn-small" onclick="openPDF('${channelID}','${id}')"><i class="ri-eye-line"></i> View</button>`;
            const docNumber = type === 'dpps' ? 'DPP' : type === 'sheets' ? 'SHEET' : 'DOC';

            row.innerHTML = `
                <div class="res-left">
                    <i class="${icon}" style="font-size:1.4rem; color:var(--text-3); flex-shrink:0;"></i>
                    <div class="res-info">
                        <div style="display:flex; align-items:flex-start; gap:10px; flex-wrap:wrap;">
                            <span style="font-family:var(--font-display); font-size:0.7rem; font-weight:800; letter-spacing:0.08em; color:var(--accent-text); background:var(--accent-subtle); padding:3px 8px; border-radius:4px; white-space:nowrap; flex-shrink:0;">${docNumber} — ${String(index + 1).padStart(2, '0')}</span>
                            <span style="white-space:normal; word-break:break-word; line-height:1.4; flex:1;">${title}</span>
                        </div>
                        <div style="font-size:0.75rem; color:var(--text-2); margin-top:5px;">PDF Document</div>
                    </div>
                </div>
                <div class="res-buttons">${viewBtn}</div>`;
        }

        container.appendChild(row);
    });
}

function escapeAttr(str) {
    return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

/* ─── 13. VIDEO PLAYER ───────────────────────────────── */

function showVideoSkeleton() {
    if (document.getElementById('video-skeleton')) return;

    const wrapper = document.getElementById('video-wrapper');
    if (!wrapper) return;

    const sk = document.createElement('div');
    sk.id = 'video-skeleton';
    sk.style.cssText = `
        position: absolute; inset: 0; z-index: 10;
        background: linear-gradient(135deg, #1a103a, #0d1a2e, #0d0d14);
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        gap: 18px; transition: opacity 0.4s ease;
        border-radius: 8px; overflow: hidden;`;

    sk.innerHTML = `
        <style>
            @keyframes vsk-spin    { to { transform: rotate(360deg); } }
            @keyframes vsk-prog    {
                0%   { margin-left:-40%; width:40%; }
                50%  { margin-left:40%; width:60%; }
                100% { margin-left:110%; width:40%; }
            }
            @keyframes vsk-dots   {
                0%   { content:''; } 25% { content:'.'; }
                50%  { content:'..'; } 75% { content:'...'; } 100% { content:''; }
            }
            @keyframes vsk-shimmer {
                0%   { background-position: -400px 0; }
                100% { background-position:  400px 0; }
            }
            .vsk-dot::after { content:''; animation: vsk-dots 1.5s steps(1) infinite; }
            .vsk-shimmer {
                background: linear-gradient(90deg,
                    rgba(255,255,255,0.04) 0%,
                    rgba(255,255,255,0.12) 50%,
                    rgba(255,255,255,0.04) 100%);
                background-size: 400px 100%;
                animation: vsk-shimmer 1.6s infinite linear;
                border-radius: 4px;
            }
        </style>

        <div style="position:relative; width:68px; height:68px;">
            <div style="position:absolute; inset:0; border-radius:50%; border:2px solid rgba(139,92,246,0.15);"></div>
            <div style="position:absolute; inset:0; border-radius:50%; border:2.5px solid transparent; border-top-color:#8b5cf6; animation:vsk-spin 1s linear infinite;"></div>
            <div style="position:absolute; inset:9px; border-radius:50%; background:rgba(139,92,246,0.12); display:flex; align-items:center; justify-content:center;">
                <svg width="20" height="20" viewBox="0 0 24 24"><polygon points="6,4 20,12 6,20" fill="rgba(139,92,246,0.85)"/></svg>
            </div>
        </div>

        <div style="text-align:center;">
            <div class="vsk-dot" style="font-size:13px; font-weight:600; color:rgba(255,255,255,0.85); letter-spacing:0.05em; margin-bottom:5px;">Connecting to server</div>
            <div style="font-size:11px; color:rgba(255,255,255,0.35); letter-spacing:0.03em;">Fetching your video, please wait</div>
        </div>

        <div style="width:160px; height:3px; background:rgba(255,255,255,0.08); border-radius:2px; overflow:hidden;">
            <div style="height:100%; background:linear-gradient(90deg,#8b5cf6,#a78bfa); border-radius:2px; animation:vsk-prog 1.8s ease-in-out infinite;"></div>
        </div>

        <div style="position:absolute; bottom:0; left:0; right:0; height:44px; background:rgba(0,0,0,0.5); display:flex; align-items:center; padding:0 14px; gap:10px;">
            <div class="vsk-shimmer" style="width:26px; height:26px; border-radius:50%; flex-shrink:0;"></div>
            <div class="vsk-shimmer" style="flex:1; height:3px;"></div>
            <div class="vsk-shimmer" style="width:44px; height:11px;"></div>
            <div class="vsk-shimmer" style="width:26px; height:26px; border-radius:50%; flex-shrink:0;"></div>
        </div>`;

    wrapper.style.position = 'relative';
    wrapper.appendChild(sk);
}

function hideVideoSkeleton() {
    const sk = document.getElementById('video-skeleton');
    if (!sk) return;
    sk.style.opacity = '0';
    setTimeout(() => sk.remove(), 450);
}

function stopRenderWakeup() {
    if (renderWakeInterval) {
        clearInterval(renderWakeInterval);
        renderWakeInterval = null;
    }
}

async function checkRenderAlive() {
    try {
        await fetch(BASE_API + 'ping', {
            method: 'HEAD',
            mode:   'no-cors',
            cache:  'no-store',
        });
        return true;
    } catch(e) {
        return false;
    }
}

function switchToRender(channelId, vidId) {
    if (!player || !currentVidId) return;

    const currentTime = player.currentTime || 0;
    const wasPlaying  = !player.paused;

    const badge = document.getElementById('stream-source-badge');
    if (badge) {
        badge.textContent = '🟢';
        badge.style.color = '#22c55e';
    }

    const renderUrl = `${BASE_API}${channelId}/${vidId}?t=${Date.now()}`;
    showVideoSkeleton();

    try {
        player.source = {
            type: 'video',
            sources: [{ src: renderUrl, type: 'video/mp4' }],
        };
        player.once('loadedmetadata', () => {
            if (currentTime > 2) player.currentTime = currentTime;
            if (wasPlaying) player.play();
        });
        player.once('playing', () => hideVideoSkeleton());
        player.once('error',   () => hideVideoSkeleton());
    } catch(e) {
        hideVideoSkeleton();
        console.warn('Render switch failed:', e);
    }

    renderReady = true;
    stopRenderWakeup();
}

function startRenderWakeup(channelId, vidId) {
    stopRenderWakeup();
    renderReady = false;

    const badge = document.getElementById('stream-source-badge');
    if (badge) {
        badge.textContent = '🟡 Railway (Standby)';
        badge.style.color = '#f59e0b';
    }

    checkRenderAlive().then(alive => {
        if (alive) switchToRender(channelId, vidId);
    });

    renderWakeInterval = setInterval(async () => {
        if (renderReady) { stopRenderWakeup(); return; }
        const alive = await checkRenderAlive();
        if (alive) switchToRender(channelId, vidId);
    }, 8000);

    setTimeout(() => {
        if (!renderReady) {
            stopRenderWakeup();
            const badge = document.getElementById('stream-source-badge');
            if (badge) {
                badge.textContent = '🔴 Railway Only';
                badge.style.color = '#ef4444';
            }
        }
    }, 180000);
}

function stopAndResetPlayer() {
    stopRenderWakeup();
    renderReady      = false;
    currentVidId     = null;
    currentChannelId = null;
    hideVideoSkeleton();

    if (videoTimeTracker) clearInterval(videoTimeTracker);
    videoTimeTracker = null;

    try {
        player.stop();
        player.source = { type:'video', sources:[] };
    } catch(e) {}
    document.getElementById('video-player-modal').classList.add('hidden');
    sessionStorage.removeItem('last_opened_video');
}

document.getElementById('close-player').onclick = () => stopAndResetPlayer();

/* ─── QUOTES ─────────────────────────────────────────── */
const QUOTES = [
    { text:"Success is the sum of small efforts, repeated day in and day out.", author:"Robert Collier" },
    { text:"The only way to do great work is to love what you study.", author:"Steve Jobs" },
    { text:"It does not matter how slowly you go, as long as you do not stop.", author:"Confucius" },
    { text:"Education is not the filling of a pail, but the lighting of a fire.", author:"W.B. Yeats" },
    { text:"The beautiful thing about learning is that no one can take it away from you.", author:"B.B. King" },
    { text:"Study while others are sleeping; work while others are loafing.", author:"William Arthur Ward" },
    { text:"Hard work beats talent when talent doesn't work hard.", author:"Tim Notke" },
    { text:"Doubt kills more dreams than failure ever will.", author:"Suzy Kassem" },
    { text:"Discipline is the bridge between goals and accomplishment.", author:"Jim Rohn" },
    { text:"The future depends on what you do today.", author:"Mahatma Gandhi" },
    { text:"Don't stop when you're tired. Stop when you're done.", author:"Unknown" },
    { text:"A little progress each day adds up to big results.", author:"Satya Nani" },
    { text:"Small daily improvements over time lead to stunning results.", author:"Robin Sharma" },
    { text:"The man who moves a mountain begins by carrying away small stones.", author:"Confucius" },
    { text:"Success is nothing more than a few simple disciplines practiced every day.", author:"Jim Rohn" },
    { text:"Motivation is what gets you started. Habit is what keeps you going.", author:"Jim Ryun" },
    { text:"Don't fear failure. Fear being in the same place next year.", author:"Unknown" },
    { text:"Every accomplishment starts with the decision to try.", author:"JFK" },
    { text:"Do something today that your future self will thank you for.", author:"Sean Patrick Flanery" },
    { text:"Hard work compounds like interest. The earlier you start, the more you gain.", author:"Unknown" },
    { text:"Believe in yourself and all that you are.", author:"Christian D. Larson" },
    { text:"Success doesn't come to you, you've got to go to it.", author:"Marva Collins" },
    { text:"Opportunities don't happen. You create them.", author:"Chris Grosser" },
    { text:"Don't quit. Suffer now and live the rest of your life as a champion.", author:"Muhammad Ali" },
    { text:"Focus on progress, not perfection.", author:"Unknown" },
    { text:"Dreams don't work unless you do.", author:"John C. Maxwell" },
    { text:"Good habits are the key to all success.", author:"Og Mandino" },
    { text:"The harder you work, the luckier you get.", author:"Gary Player" },
    { text:"Growth begins at the end of your comfort zone.", author:"Tony Robbins" },
    { text:"Discipline is choosing between what you want now and what you want most.", author:"Abraham Lincoln" },
];

/* ─── openPlayer ─────────────────────────────────────── */
function openPlayer(channelId, vidId, title) {
    currentChannelId = channelId;
    currentVidId     = vidId;

    sessionStorage.setItem('last_opened_video', JSON.stringify({
        classId: appState.classId,
        batchIdx: appState.batchIdx,
        chapterIdx: appState.chapterIdx,
        channelId,
        videoId: vidId,
        title,
        currentTime: 0
    }));

    if (videoTimeTracker) clearInterval(videoTimeTracker);
    videoTimeTracker = setInterval(() => {
        if (player && !player.paused) {
            try {
                const saved = JSON.parse(sessionStorage.getItem('last_opened_video') || '{}');
                saved.currentTime = player.currentTime || 0;
                sessionStorage.setItem('last_opened_video', JSON.stringify(saved));
            } catch (e) {}
        }
    }, 2000);

    const modal = document.getElementById('video-player-modal');
    modal.classList.remove('hidden');
    document.getElementById('vp-sidebar').classList.remove('sidebar-open');

    let batchChannelId = channelId;
    let batchName      = "Now Playing";

    if (appState.classId && appState.batchIdx !== null && DB[appState.classId]) {
        const batch = DB[appState.classId].batches[appState.batchIdx];
        batchName   = batch.batch_name.toUpperCase();
        if (batch.channel_id) batchChannelId = batch.channel_id;
    }

    currentChannelId = batchChannelId;

    document.getElementById('vp-title').innerText        = batchName;
    document.getElementById('vp-lecture-name').innerText = title;

    const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    document.getElementById('vp-quote').innerHTML = `
        "${q.text}"
        <br><span style="font-size:0.82rem; opacity:0.75; display:block; margin-top:6px; color:var(--accent-text);">— ${q.author}</span>`;

    if (!document.getElementById('stream-source-badge')) {
        const badge = document.createElement('span');
        badge.id    = 'stream-source-badge';
        badge.style.cssText = 'font-size:0.72rem; font-weight:700; padding:3px 10px; border-radius:20px; background:rgba(0,0,0,0.35); margin-left:10px; vertical-align:middle;';
        badge.textContent   = '🟡';
        badge.style.color   = '#f59e0b';
        const titleEl = document.getElementById('vp-title');
        if (titleEl) titleEl.insertAdjacentElement('afterend', badge);
    } else {
        const badge = document.getElementById('stream-source-badge');
        badge.textContent = '🟡';
        badge.style.color = '#f59e0b';
    }

    const railwayUrl = `${RAILWAY_BASE_API}${batchChannelId}/${vidId}?t=${Date.now()}`;
    const renderUrl  = `${BASE_API}${batchChannelId}/${vidId}?t=${Date.now()}`;

    const playUrl = (renderReady && navPingDone) ? renderUrl : railwayUrl;

    if (renderReady && navPingDone) {
        const badge = document.getElementById('stream-source-badge');
        if (badge) { badge.textContent = '🟢'; badge.style.color = '#22c55e'; }
    }

    showVideoSkeleton();

    try {
        player.source = {
            type: 'video',
            sources: [{ src: playUrl, type: 'video/mp4' }],
        };
        player.play();
    } catch(e) {
        document.getElementById('video-wrapper').innerHTML =
            `<video id="player" playsinline controls autoplay style="position:absolute;inset:0;width:100%;height:100%;">
                <source src="${playUrl}" type="video/mp4">
             </video>`;
    }

    player.once('playing', () => hideVideoSkeleton());
    player.once('canplay', () => hideVideoSkeleton());
    player.once('error',   () => hideVideoSkeleton());

    if (!renderReady || !navPingDone) {
        startRenderWakeup(batchChannelId, vidId);
    }

    buildAttachmentsSidebar(batchChannelId);
}

/* ─── buildAttachmentsSidebar ────────────────────────── */
function buildAttachmentsSidebar(channelId) {
    const attachList = document.getElementById('vp-attachments-list');
    attachList.innerHTML = '';

    if (!appState.classId || appState.batchIdx === null || appState.chapterIdx === null) {
        attachList.innerHTML = '<div style="color:var(--text-3); padding:16px; text-align:center; font-size:0.85rem;">Attachments only available in chapter view.</div>';
        return;
    }

    const chapter = DB[appState.classId].batches[appState.batchIdx].chapters[appState.chapterIdx];
    let grouped   = {};

    const addGroup = (items, type) => {
        if (!items?.length) return;
        items.forEach(item => {
            const id    = item.id || item.notes_id;
            const title = item.title || (item.lec_no ? `${type} ${item.lec_no}` : 'Document');
            if (id) {
                if (!grouped[type]) grouped[type] = [];
                grouped[type].push({ title, id });
            }
        });
    };

    (chapter.lectures || []).forEach(l => {
        if (l.notes_id) {
            if (!grouped['Lecture Notes']) grouped['Lecture Notes'] = [];
            grouped['Lecture Notes'].push({ title: l.title + " (Notes)", id: l.notes_id });
        }
    });

    addGroup(chapter.notes,  'Notes');
    addGroup(chapter.dpps,   'DPPs');
    addGroup(chapter.sheets, 'Sheets');

    const order = ['Lecture Resources','Notes','DPPs','Sheets'];
    let hasContent = false;

    if ((chapter.lectures || []).length) {
        hasContent = true;
        const header = document.createElement('div');
        header.style.cssText = 'font-family:var(--font-display); font-size:0.7rem; font-weight:800; letter-spacing:0.1em; text-transform:uppercase; color:var(--accent-text); padding:14px 4px 6px; border-bottom:1px solid var(--border); margin-bottom:4px;';
        header.innerText = 'Lecture Resources';
        attachList.appendChild(header);

        (chapter.lectures || []).forEach((lecture, index) => {
            const title = lecture.title || `Lecture ${index + 1}`;
            const badgeIcon = lecture.video_id ? 'ri-play-circle-line' : 'ri-file-text-line';
            const el = document.createElement('div');
            el.className = 'attachment-item';
            el.innerHTML = `
                <div class="res-left" style="gap:8px; align-items:center;">
                    <i class="${badgeIcon}" style="color:var(--text-3); flex-shrink:0;"></i>
                    <div style="font-size:0.82rem; color:var(--text-1); line-height:1.3;">${title}</div>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
                    ${lecture.video_id ? `<button class="btn-small" onclick="openPlayer('${channelId}','${lecture.video_id}','${escapeAttr(title)}')" style="font-size:0.75rem; padding:5px 10px;"><i class="ri-play-fill"></i> Play</button>` : ''}
                    ${lecture.notes_id ? `<button class="btn-small" onclick="openPDF('${channelId}','${lecture.notes_id}')" style="font-size:0.75rem; padding:5px 10px;"><i class="ri-eye-line"></i> View</button>` : ''}
                </div>`;
            attachList.appendChild(el);
        });
    }

    order.forEach(type => {
        if (!grouped[type]?.length) return;
        hasContent = true;

        const header = document.createElement('div');
        header.style.cssText = 'font-family:var(--font-display); font-size:0.7rem; font-weight:800; letter-spacing:0.1em; text-transform:uppercase; color:var(--accent-text); padding:14px 4px 6px; border-bottom:1px solid var(--border); margin-bottom:4px;';
        header.innerText = type;
        attachList.appendChild(header);

        grouped[type].forEach(doc => {
            const el = document.createElement('div');
            el.className = 'attachment-item';
            el.innerHTML = `
                <div class="res-left" style="gap:8px;">
                    <i class="ri-file-text-line" style="color:var(--text-3); flex-shrink:0;"></i>
                    <div style="font-size:0.82rem; color:var(--text-1); line-height:1.3;">${doc.title}</div>
                </div>
                <button class="btn-small" onclick="openPDF('${channelId}','${doc.id}')" style="font-size:0.75rem; padding:5px 10px;">
                    <i class="ri-eye-line"></i> View
                </button>`;
            attachList.appendChild(el);
        });
    });

    if (!hasContent) {
        attachList.innerHTML = '<div style="color:var(--text-3); padding:16px; text-align:center; font-size:0.85rem; margin-top:20px;">No attachments for this chapter.</div>';
    }
}

/* ─── 14. PDF VIEWER ─────────────────────────────────── */
function openPDF(channelId, id) {
    if (!id) return alert("PDF not available");
    if (!channelId || channelId === 'undefined' || channelId === 'null') {
        channelId = "-1003345907635";
    }
    window.open(`pdf.html?id=${id}&cid=${channelId}`, '_blank');
}

/* ─── 15. THEME ──────────────────────────────────────── */
function initTheme() {
    const btn = document.getElementById('theme-toggle');
    if (localStorage.getItem('theme') === 'light') {
        document.body.setAttribute('data-theme', 'light');
        btn.innerHTML = '<i class="ri-sun-line"></i> <span class="desktop-only">Light Mode</span>';
    }
    btn.onclick = () => {
        const isLight = document.body.hasAttribute('data-theme');
        if (isLight) {
            document.body.removeAttribute('data-theme');
            localStorage.setItem('theme', 'dark');
            btn.innerHTML = '<i class="ri-moon-line"></i> <span class="desktop-only">Dark Mode</span>';
        } else {
            document.body.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
            btn.innerHTML = '<i class="ri-sun-line"></i> <span class="desktop-only">Light Mode</span>';
        }
    };
}

/* ─── 16. AI DOUBT SOLVER ────────────────────────────── */
function initDoubtSolver() {
    const fab      = document.getElementById('doubt-btn');
    const modal    = document.getElementById('doubt-modal');
    const closeBtn = document.getElementById('close-doubt');
    const sendBtn  = document.getElementById('send-doubt');
    const input    = document.getElementById('doubt-input');
    const history  = document.getElementById('chat-history');

    if (!fab || !modal) return;

    fab.onclick = () => {
        modal.classList.toggle('hidden');
        if (!modal.classList.contains('hidden')) input.focus();
    };

    closeBtn?.addEventListener('click', () => modal.classList.add('hidden'));

    const sendMessage = async () => {
        const msg = input.value.trim();
        if (!msg) return;

        const userBubble = document.createElement('div');
        userBubble.style.cssText = 'text-align:right; margin-bottom:8px;';
        userBubble.innerHTML = `<span style="display:inline-block; background:var(--accent-subtle); border:1px solid var(--accent); color:var(--text-1); border-radius:12px 12px 2px 12px; padding:8px 12px; font-size:0.85rem; max-width:85%; word-break:break-word;">${msg}</span>`;
        history.appendChild(userBubble);

        const loading = document.createElement('div');
        loading.id    = 'ai-loading';
        loading.style.cssText = 'text-align:left; margin-bottom:8px;';
        loading.innerHTML = `<span style="display:inline-block; background:var(--bg-elevated); border:1px solid var(--border); color:var(--text-2); border-radius:2px 12px 12px 12px; padding:8px 12px; font-size:0.85rem; font-style:italic;">Typing…</span>`;
        history.appendChild(loading);
        history.scrollTop = history.scrollHeight;

        input.value      = '';
        input.disabled   = true;
        sendBtn.disabled = true;

        try {
            const res  = await fetch(AI_HANDLER_URL, {
                method: 'POST',
                headers: { 'Content-Type':'application/json' },
                body: JSON.stringify({ question: msg })
            });
            const data   = await res.json();
            const answer = data.answer || "Server se jawab nahi aaya. Please retry.";

            const el = document.getElementById('ai-loading');
            if (el) {
                el.innerHTML = `<span style="display:inline-block; background:var(--bg-elevated); border:1px solid var(--border); color:var(--text-1); border-radius:2px 12px 12px 12px; padding:8px 12px; font-size:0.85rem; max-width:85%; word-break:break-word; line-height:1.5;">${answer}</span>`;
                el.removeAttribute('id');
            }
        } catch(err) {
            const el = document.getElementById('ai-loading');
            if (el) {
                el.innerHTML = `<span style="display:inline-block; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); color:#ef4444; border-radius:2px 12px 12px 12px; padding:8px 12px; font-size:0.85rem;">Network error. Please check your connection.</span>`;
                el.removeAttribute('id');
            }
        } finally {
            input.disabled   = false;
            sendBtn.disabled = false;
            history.scrollTop = history.scrollHeight;
            input.focus();
        }
    };

    sendBtn?.addEventListener('click', sendMessage);
    input?.addEventListener('keypress', e => {
        if (e.key === 'Enter' && !input.disabled) { sendMessage(); e.preventDefault(); }
    });
}

/* ─── TELEGRAM JOIN POPUP ─────────────────────────────── */
function initTelegramPopup() {
    const TELEGRAM_URL = 'https://t.me/+7q9n0MEJ0Jk1N2U1';
    const mutedAt = parseInt(localStorage.getItem('tg_popup_muted') || '0');
    if (Date.now() - mutedAt < 24 * 60 * 60 * 1000) return;

    const overlay = document.createElement('div');
    overlay.id = 'tg-popup-overlay';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 99999;
        background: rgba(0,0,0,0.55);
        display: flex; align-items: center; justify-content: center;
        animation: tgFadeIn 0.25s ease;`;

    overlay.innerHTML = `
        <style>
            @keyframes tgFadeIn  { from { opacity:0 } to { opacity:1 } }
            @keyframes tgSlideUp { from { opacity:0; transform:translateY(24px) scale(0.97) } to { opacity:1; transform:none } }
        </style>
        <div style="
            background: var(--bg-card, #1a1a2e);
            border: 1px solid rgba(139,92,246,0.25);
            border-radius: 18px;
            padding: 32px 28px 28px;
            width: min(88vw, 340px);
            text-align: center;
            position: relative;
            animation: tgSlideUp 0.3s ease;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);">

            <button id="tg-close-btn" style="
                position: absolute; top: 12px; right: 14px;
                background: none; border: none; cursor: pointer;
                color: rgba(255,255,255,0.45); font-size: 20px; line-height:1;
                padding: 4px 6px; border-radius: 6px;
                transition: color 0.2s, background 0.2s;"
                onmouseover="this.style.background='rgba(255,255,255,0.08)';this.style.color='rgba(255,255,255,0.8)'"
                onmouseout="this.style.background='none';this.style.color='rgba(255,255,255,0.45)'">
                ✕
            </button>

            <div style="
                width: 62px; height: 62px; border-radius: 50%;
                background: linear-gradient(135deg, #2AABEE, #1e88cc);
                display: flex; align-items: center; justify-content: center;
                margin: 0 auto 16px; font-size: 28px;">
                ✈️
            </div>

            <div style="font-size: 1rem; font-weight: 600; color: var(--text-1, #fff); margin-bottom: 16px; letter-spacing: 0.02em; line-height:1.4;">
                Join our official Telegram channel for latest updates and support the CodexTRMS community.
            </div>

            <button id="tg-join-btn" style="
                display: block; width: 100%;
                background: linear-gradient(135deg, #7c3aed, #4f46e5);
                color: #fff; font-size: 0.95rem; font-weight: 700;
                border: none; border-radius: 10px; padding: 13px 0;
                cursor: pointer; letter-spacing: 0.03em;
                transition: transform 0.15s, opacity 0.15s;"
                onmouseover="this.style.opacity='0.88'"
                onmouseout="this.style.opacity='1'"
                onmousedown="this.style.transform='scale(0.97)'"
                onmouseup="this.style.transform='scale(1)'">
                🚀 Join Telegram Channel
            </button>
            <button id="tg-mute-btn" style="
                display: block; width: 100%; margin-top: 12px;
                background: rgba(255,255,255,0.08);
                color: #f8fbff; font-size: 0.95rem; font-weight: 700;
                border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; padding: 13px 0;
                cursor: pointer; letter-spacing: 0.02em;
                transition: transform 0.15s, opacity 0.15s;"
                onmouseover="this.style.opacity='0.88'"
                onmouseout="this.style.opacity='1'"
                onmousedown="this.style.transform='scale(0.97)'"
                onmouseup="this.style.transform='scale(1)'">
                🔕 Mute for 24 Hours
            </button>

            <div style="font-size: 0.72rem; color: var(--text-3, rgba(255,255,255,0.3)); margin-top: 14px;">
                You can close this and join later anytime.
            </div>
        </div>`;

    document.body.appendChild(overlay);

    const dismiss = () => {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.2s';
        setTimeout(() => overlay.remove(), 220);
    };

    document.getElementById('tg-close-btn').onclick = dismiss;
    overlay.addEventListener('click', e => { if (e.target === overlay) dismiss(); });

    document.getElementById('tg-join-btn').onclick = () => {
        window.open('https://t.me/+7q9n0MEJ0Jk1N2U1', '_blank');
        dismiss();
    };

    document.getElementById('tg-mute-btn').onclick = () => {
        localStorage.setItem('tg_popup_muted', Date.now().toString());
        dismiss();
    };
}

// Show popup after 0.8 seconds on page load
setTimeout(initTelegramPopup, 800);
