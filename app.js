;(function () {
  "use strict"

  /** Schmale Viewports / Handy: setzt data-mobile für CSS (Stretch & Safe Area). */
  const mqNarrow = window.matchMedia("(max-width: 1023px)")
  function syncMobileLayout() {
    document.documentElement.dataset.mobile = mqNarrow.matches ? "1" : "0"
  }
  syncMobileLayout()
  if (mqNarrow.addEventListener) mqNarrow.addEventListener("change", syncMobileLayout)
  else if (mqNarrow.addListener) mqNarrow.addListener(syncMobileLayout)

  const PRIZE_PERCENT = [50, 30, 20]
  const PRESET_KEY = "turnierbaum-presets-v1"
  const THEME_KEY = "turnierbaum-theme"

  const COLORS = [
    "#e81c5a",
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#8b5cf6",
    "#06b6d4",
    "#f97316",
    "#84cc16",
  ]

  let teams = []
  let matches = []
  let champion = null
  let appState = "setup"
  let prizeMoney = null

  function $(id) {
    return document.getElementById(id)
  }

  function generateId() {
    return Math.random().toString(36).slice(2, 15)
  }

  function nextPowerOf2(n) {
    let p = 1
    while (p < n) p *= 2
    return p
  }

  function randomColor() {
    return COLORS[Math.floor(Math.random() * COLORS.length)]
  }

  function generateBracket(teamList) {
    const size = nextPowerOf2(teamList.length)
    const totalRounds = Math.log2(size)
    const out = []
    const shuffled = [...teamList].sort(() => Math.random() - 0.5)
    const padded = [...shuffled]
    while (padded.length < size) padded.push(null)

    for (let i = 0; i < size / 2; i++) {
      const team1 = padded[i * 2]
      const team2 = padded[i * 2 + 1]
      const bye = !team1 || !team2
      out.push({
        id: generateId(),
        round: 0,
        position: i,
        team1: team1 || null,
        team2: team2 || null,
        winner: bye ? team1 || team2 : null,
      })
    }

    for (let round = 1; round <= totalRounds - 1; round++) {
      const prev = out.filter((m) => m.round === round - 1)
      for (let i = 0; i < prev.length / 2; i++) {
        const pm1 = prev[i * 2]
        const pm2 = prev[i * 2 + 1]
        out.push({
          id: generateId(),
          round,
          position: i,
          team1: pm1.winner || null,
          team2: pm2.winner || null,
          winner: null,
        })
      }
    }
    return out
  }

  function clearDownstream(matchesArr, fromRound, fromPosition) {
    const nextRound = fromRound + 1
    const nextPosition = Math.floor(fromPosition / 2)
    const isTopSlot = fromPosition % 2 === 0
    const nextMatch = matchesArr.find((m) => m.round === nextRound && m.position === nextPosition)
    if (!nextMatch) return
    if (isTopSlot) nextMatch.team1 = null
    else nextMatch.team2 = null
    if (nextMatch.winner) {
      nextMatch.winner = null
      clearDownstream(matchesArr, nextMatch.round, nextMatch.position)
    }
  }

  function formatPrize(n) {
    return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(n)
  }

  function loadPresets() {
    try {
      const raw = localStorage.getItem(PRESET_KEY)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  }

  function savePresets(list) {
    localStorage.setItem(PRESET_KEY, JSON.stringify(list))
  }

  function refreshPresetSelect() {
    const sel = $("presetSelect")
    const presets = loadPresets()
    sel.innerHTML = ""
    const opt0 = document.createElement("option")
    opt0.value = ""
    opt0.textContent = "— Preset wählen —"
    sel.appendChild(opt0)
    presets.forEach((p) => {
      const o = document.createElement("option")
      o.value = p.id
      o.textContent = p.name
      sel.appendChild(o)
    })
  }

  function renderTeams() {
    const list = $("teamList")
    list.innerHTML = ""
    teams.forEach((t) => {
      const row = document.createElement("div")
      row.className = "team-row"
      row.innerHTML =
        '<span class="team-dot" style="background:' +
        t.color +
        '"></span><span>' +
        escapeHtml(t.name) +
        "</span>"
      if (appState === "setup") {
        const btn = document.createElement("button")
        btn.type = "button"
        btn.textContent = "×"
        btn.addEventListener("click", () => {
          teams = teams.filter((x) => x.id !== t.id)
          renderTeams()
          updateTeamCount()
        })
        row.appendChild(btn)
      }
      list.appendChild(row)
    })
    updateTeamCount()
  }

  function escapeHtml(s) {
    const d = document.createElement("div")
    d.textContent = s
    return d.innerHTML
  }

  function updateTeamCount() {
    const el = $("teamCount")
    if (teams.length >= 2) {
      el.textContent = teams.length + " Teams"
    } else {
      el.textContent = ""
    }
  }

  function updatePrizeHint() {
    const p = $("prizeSplit")
    if (prizeMoney != null && prizeMoney > 0) {
      p.textContent =
        "1. " +
        formatPrize(Math.round((prizeMoney * PRIZE_PERCENT[0]) / 100)) +
        " · 2. " +
        formatPrize(Math.round((prizeMoney * PRIZE_PERCENT[1]) / 100)) +
        " · 3. " +
        formatPrize(Math.round((prizeMoney * PRIZE_PERCENT[2]) / 100))
    } else {
      p.textContent = ""
    }
  }

  function roundLabel(maxRound, idx) {
    if (idx === maxRound) return "Finale"
    if (idx === maxRound - 1 && maxRound > 1) return "Halbfinale"
    if (idx === maxRound - 2 && maxRound > 2) return "Viertelfinale"
    return "Runde " + (idx + 1)
  }

  function renderBracket() {
    const wrap = $("bracket")
    wrap.innerHTML = ""
    if (!matches.length) return

    const maxRound = Math.max.apply(
      null,
      matches.map((m) => m.round)
    )
    const rounds = []
    for (let r = 0; r <= maxRound; r++) {
      rounds.push(
        matches
          .filter((m) => m.round === r)
          .sort((a, b) => a.position - b.position)
      )
    }

    const firstCount = rounds[0].length
    const minH = firstCount * 88

    rounds.forEach((roundMatches, roundIdx) => {
      const col = document.createElement("div")
      col.className = "round-col"
      const lab = document.createElement("div")
      lab.className = "round-label"
      lab.textContent = roundLabel(maxRound, roundIdx)
      col.appendChild(lab)
      const inner = document.createElement("div")
      inner.className = "round-matches"
      inner.style.minHeight = minH + "px"

      roundMatches.forEach((match) => {
        inner.appendChild(renderMatch(match, roundIdx === maxRound))
      })
      col.appendChild(inner)
      wrap.appendChild(col)
    })
  }

  function renderMatch(match, isFinal) {
    const box = document.createElement("div")
    box.className = "match" + (isFinal ? " final" : "")

    box.appendChild(renderSlot(match, "team1"))
    const hr = document.createElement("hr")
    box.appendChild(hr)
    box.appendChild(renderSlot(match, "team2"))
    return box
  }

  function renderSlot(match, key) {
    const team = match[key]
    const isWinner = match.winner && match.winner.id === team?.id
    const isLoser = match.winner && team && match.winner.id !== team.id

    const btn = document.createElement("button")
    btn.type = "button"
    btn.className = "slot"
    if (!team) {
      btn.innerHTML = '<span class="bye">Freilos</span>'
      btn.disabled = true
      return btn
    }

    btn.innerHTML =
      '<span class="team-dot" style="background:' +
      team.color +
      '"></span><span>' +
      escapeHtml(team.name) +
      "</span>"
    if (isWinner) btn.classList.add("winner")
    if (isLoser) btn.classList.add("loser")

    const canClick = canSelectWinner(match, team)
    if (canClick) {
      btn.classList.add("clickable")
      btn.addEventListener("click", () => selectWinner(match.id, team))
    } else {
      btn.disabled = true
    }
    return btn
  }

  function canSelectWinner(match, team) {
    if (appState !== "tournament") return false
    if (!team) return false
    if (match.winner && match.winner.id === team.id) return true
    if (match.winner) return false
    if (!match.team1 || !match.team2) return true
    return true
  }

  function selectWinner(matchId, winner) {
    const m = matches.find((x) => x.id === matchId)
    if (!m) return

    if (m.winner && m.winner.id === winner.id) {
      m.winner = null
      clearDownstream(matches, m.round, m.position)
      champion = null
    } else {
      if (m.winner) {
        clearDownstream(matches, m.round, m.position)
        champion = null
      }
      m.winner = winner
      const nr = m.round + 1
      const np = Math.floor(m.position / 2)
      const top = m.position % 2 === 0
      const next = matches.find((x) => x.round === nr && x.position === np)
      if (next) {
        if (top) next.team1 = winner
        else next.team2 = winner
      }
      const maxR = Math.max.apply(
        null,
        matches.map((x) => x.round)
      )
      const finalM = matches.find((x) => x.round === maxR)
      champion = finalM && finalM.winner ? finalM.winner : null
    }

    renderBracket()
    renderChampion()
  }

  function renderChampion() {
    const box = $("championBox")
    if (champion) {
      box.classList.remove("hidden")
      box.innerHTML =
        "<span>🏆</span><span class=\"team-dot\" style=\"background:" +
        champion.color +
        "\"></span><span>" +
        escapeHtml(champion.name) +
        "</span><span>🏆</span>"
    } else {
      box.classList.add("hidden")
      box.innerHTML = ""
    }
  }

  function setTournamentMode(on) {
    appState = on ? "tournament" : "setup"
    $("placeholder").classList.toggle("hidden", on)
    $("bracketWrap").classList.toggle("hidden", !on)
    $("startBtn").classList.toggle("hidden", on)
    $("resetBtn").classList.toggle("hidden", !on)
    $("newTeamName").disabled = on
    $("addTeam").disabled = on
    $("prizeInput").disabled = on
    $("presetSelect").disabled = on
    $("loadPreset").disabled = on
    $("savePreset").disabled = on
    $("deletePreset").disabled = on
    renderTeams()
  }

  function init() {
    const theme = localStorage.getItem(THEME_KEY) || "dark"
    document.documentElement.setAttribute("data-theme", theme === "light" ? "light" : "dark")
    $("themeIcon").textContent = theme === "light" ? "☀️" : "🌙"

    $("themeToggle").addEventListener("click", () => {
      const t = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light"
      document.documentElement.setAttribute("data-theme", t)
      localStorage.setItem(THEME_KEY, t)
      $("themeIcon").textContent = t === "light" ? "☀️" : "🌙"
    })

    $("addTeam").addEventListener("click", () => {
      const inp = $("newTeamName")
      const name = inp.value.trim()
      if (!name) return
      teams.push({ id: generateId(), name, color: randomColor() })
      inp.value = ""
      renderTeams()
    })

    $("newTeamName").addEventListener("keydown", (e) => {
      if (e.key === "Enter") $("addTeam").click()
    })

    $("prizeInput").addEventListener("input", (e) => {
      const raw = e.target.value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".")
      if (raw === "") {
        prizeMoney = null
      } else {
        const n = parseFloat(raw)
        if (!isNaN(n) && n >= 0) prizeMoney = Math.round(n)
      }
      updatePrizeHint()
    })

    $("startBtn").addEventListener("click", () => {
      if (teams.length < 2) return
      matches = generateBracket(teams)
      champion = null
      setTournamentMode(true)
      renderBracket()
      renderChampion()
      const tr = Math.log2(nextPowerOf2(teams.length))
      $("startBtn").textContent = "Turnier starten (" + tr + " Runde" + (tr !== 1 ? "n" : "") + ")"
    })

    $("resetBtn").addEventListener("click", () => {
      matches = []
      champion = null
      setTournamentMode(false)
      $("startBtn").textContent = "Turnier starten"
    })

    $("loadPreset").addEventListener("click", () => {
      const id = $("presetSelect").value
      if (!id) return
      const presets = loadPresets()
      const p = presets.find((x) => x.id === id)
      if (p && p.teams) {
        teams = p.teams.map((t) => ({ ...t, id: t.id || generateId() }))
        renderTeams()
      }
    })

    $("savePreset").addEventListener("click", () => {
      const name = prompt("Preset-Name?")
      if (!name || !name.trim()) return
      const presets = loadPresets()
      presets.push({
        id: generateId(),
        name: name.trim(),
        teams: teams.map((t) => ({ ...t })),
      })
      savePresets(presets)
      refreshPresetSelect()
    })

    $("deletePreset").addEventListener("click", () => {
      const id = $("presetSelect").value
      if (!id) return
      const presets = loadPresets().filter((x) => x.id !== id)
      savePresets(presets)
      refreshPresetSelect()
    })

    refreshPresetSelect()
    renderTeams()
    setTournamentMode(false)
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init)
  } else {
    init()
  }
})()
