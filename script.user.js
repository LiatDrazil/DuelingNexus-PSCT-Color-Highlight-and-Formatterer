// ==UserScript==
// @name         DuelingNexus - PSCT Color Highlighter & Formatter
// @namespace    https://github.com/LiatDrazil
// @version      2.9.27
// @description  Highlights PSCT conditions, costs, and summon conditions, formats card names and Quick Effects, with custom spacing controls.
// @author       LiatDrazil
// @match        https://duelingnexus.com/duel/*
// @match        https://duelingnexus.com/replay/*
// @match        https://duelingnexus.com/game/*
// @match        https://duelingnexus.com/editor/*
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/LiatDrazil/DuelingNexus-PSCT-Color-Highlight-and-Formatterer/main/script.user.js
// @updateURL    https://raw.githubusercontent.com/LiatDrazil/DuelingNexus-PSCT-Color-Highlight-and-Formatterer/main/script.user.js
// ==/UserScript==

(function () {
    'use strict';

    // Default values
    const DEFAULT_CONDITION_COLOR = '#F1FA8C';
    const DEFAULT_COST_COLOR = '#FF79C6';
    const DEFAULT_SUMMON_COLOR = '#8BE9FD'; // Cyan style for Summon Conditions
    const DEFAULT_SPACING_GAP = 10;

    // Storage keys for user settings
    const STORAGE_KEY_CONDITION = 'psct_color_condition';
    const STORAGE_KEY_COST = 'psct_color_cost';
    const STORAGE_KEY_SUMMON = 'psct_color_summon';
    const STORAGE_KEY_ENABLE_COLORS = 'psct_enable_colors';
    const STORAGE_KEY_ENABLE_CONDITION = 'psct_enable_condition';
    const STORAGE_KEY_ENABLE_COST = 'psct_enable_cost';
    const STORAGE_KEY_ENABLE_SUMMON = 'psct_enable_summon';
    const STORAGE_KEY_ENABLE_NAMES = 'psct_enable_names';
    const STORAGE_KEY_ENABLE_QUICK = 'psct_enable_quick';
    const STORAGE_KEY_SPACING_GAP = 'psct_spacing_gap';
    const STORAGE_KEY_GAP_ENABLED = 'psct_gap_enabled';

    // Settings state initialized from localStorage
    let PSCT_SETTINGS = {
        conditionColor: localStorage.getItem(STORAGE_KEY_CONDITION) || DEFAULT_CONDITION_COLOR,
        costColor: localStorage.getItem(STORAGE_KEY_COST) || DEFAULT_COST_COLOR,
        summonColor: localStorage.getItem(STORAGE_KEY_SUMMON) || DEFAULT_SUMMON_COLOR,
        enableColors: localStorage.getItem(STORAGE_KEY_ENABLE_COLORS) !== 'false',
        enableCondition: localStorage.getItem(STORAGE_KEY_ENABLE_CONDITION) !== 'false',
        enableCost: localStorage.getItem(STORAGE_KEY_ENABLE_COST) !== 'false',
        enableSummon: localStorage.getItem(STORAGE_KEY_ENABLE_SUMMON) !== 'false',
        enableCardNames: localStorage.getItem(STORAGE_KEY_ENABLE_NAMES) !== 'false',
        enableQuickEffect: localStorage.getItem(STORAGE_KEY_ENABLE_QUICK) !== 'false',
        spacingGap: parseInt(localStorage.getItem(STORAGE_KEY_SPACING_GAP) || DEFAULT_SPACING_GAP, 10),
        gapEnabled: localStorage.getItem(STORAGE_KEY_GAP_ENABLED) !== 'false'
    };

    /**
     * Sanitizes raw string characters to prevent unsafe HTML injection.
     */
    function escapeHTML(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    /**
     * Finds the index of a PSCT punctuation mark (':' or ';') within a string.
     */
    function findPSCTPunctuation(str, char) {
        let inQuotes = false;

        for (let i = 0; i < str.length; i++) {
            const current = str[i];
            
            if (current === '"' || current === '“' || current === '”') {
                inQuotes = !inQuotes;
            } else if (current === char && !inQuotes) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Replaces quoted text (card names) and Quick Effect mentions with appropriate styles.
     */
    function formatCardNames(text) {
        if (!text) return "";
        let escaped = escapeHTML(text);

        if (PSCT_SETTINGS.enableCardNames) {
            escaped = escaped.replace(/(?:"|“)(.*?)(?:"|”)/g, (match, name) => {
                return `<span style="font-style: italic;">"${name}"</span>`;
            });
        }

        if (PSCT_SETTINGS.enableQuickEffect) {
            escaped = escaped.replace(/(\(Quick Effect\)|\bQuick Effects?\b)/gi, '<strong style="font-weight: bold;">$1</strong>');
        }

        return escaped;
    }

    /**
     * Checks if a sentence represents or contains a Summon Condition.
     */
    function isSummonCondition(text) {
        if (!text) return false;
        
        const lower = text.trim().toLowerCase();

        // If it contains a semicolon (;), it is never a summon condition (activation cost)
        if (text.includes(';')) return false;

        // If it contains a colon (:), we only accept it if it is strictly a summon clause
        if (text.includes(':') && !lower.includes("summon")) return false;

        // Must contain the word "by" as a whole word to be evaluated
        const hasBy = /\bby\b/.test(lower);
        if (!hasBy) return false;

        // Strip/remove invalid "by" occurrences to check if at least one valid "by" remains
        let cleanedLower = lower
            .replace(/by\s+its\s+own\s+effect/g, '')
            .replace(/by\s+other\s+ways/g, '')
            .replace(/by\s+(?:["“].*?["”])/g, '');

        // If after cleaning all forbidden patterns there are no more "by" words left, it's invalid
        const hasValidBy = /\bby\b/.test(cleanedLower);
        if (!hasValidBy) return false;
        
        const summonKeywords = [
            "must be either",
            "must be special summoned",
            "must first be special summoned",
            "must be fusion summoned",
            "must be synchro summoned",
            "must be xyz summoned",
            "must be link summoned",
            "must be ritual summoned",
            "you can special summon this card",
            "must first be fusion summoned",
            "must first be synchro summoned",
            "must first be xyz summoned",
            "must first be link summoned",
            "must first be ritual summoned",
            "summon this card"
        ];
        
        const hasKeyword = summonKeywords.some(keyword => lower.includes(keyword));
        
        // For "you can also", we strictly require it to be accompanied explicitly by a Summon action
        const hasStrictAlsoSummon = /you can also.*(?:summon)/i.test(lower);
        const hasAlternativeSummonPattern = /you can.*(?:summon).*this card/i.test(lower) || hasStrictAlsoSummon;

        return hasKeyword || hasAlternativeSummonPattern;
    }

    /**
     * Formats summon conditions.
     */
    function formatSummonCondition(text) {
        if (!PSCT_SETTINGS.enableColors || !PSCT_SETTINGS.enableSummon) return formatCardNames(text);

        return `<span style="color: ${PSCT_SETTINGS.summonColor}; font-weight: 500;">${formatCardNames(text)}</span>`;
    }

    /**
     * Wraps conditions, costs, and summon conditions in custom-colored HTML <span> tags if colors are enabled.
     */
    function highlightPSCTInBlock(text) {
        if (!text || !text.trim()) return text;

        if (isSummonCondition(text)) {
            return formatSummonCondition(text);
        }

        if (!PSCT_SETTINGS.enableColors) return formatCardNames(text);

        const colonIndex = findPSCTPunctuation(text, ':');
        const semicolonIndex = findPSCTPunctuation(text, ';');

        // Case 1: Both Condition (:) and Cost (;) are present
        if (colonIndex !== -1 && semicolonIndex !== -1 && colonIndex < semicolonIndex) {
            const conditionPart = text.substring(0, colonIndex + 1);
            const costPart = text.substring(colonIndex + 1, semicolonIndex + 1);
            const effectPart = text.substring(semicolonIndex + 1);

            const condOutput = PSCT_SETTINGS.enableCondition 
                ? `<span style="color: ${PSCT_SETTINGS.conditionColor}; font-weight: 500;">${formatCardNames(conditionPart)}</span>` 
                : formatCardNames(conditionPart);

            const costOutput = PSCT_SETTINGS.enableCost 
                ? `<span style="color: ${PSCT_SETTINGS.costColor}; font-weight: 500;">${formatCardNames(costPart)}</span>` 
                : formatCardNames(costPart);

            return condOutput + costOutput + formatCardNames(effectPart);
        } 
        // Case 2: Only Condition (:) is present
        else if (colonIndex !== -1) {
            const conditionPart = text.substring(0, colonIndex + 1);
            const effectPart = text.substring(colonIndex + 1);

            const condOutput = PSCT_SETTINGS.enableCondition 
                ? `<span style="color: ${PSCT_SETTINGS.conditionColor}; font-weight: 500;">${formatCardNames(conditionPart)}</span>` 
                : formatCardNames(conditionPart);

            return condOutput + formatCardNames(effectPart);
        } 
        // Case 3: Only Cost (;) is present
        else if (semicolonIndex !== -1) {
            const costPart = text.substring(0, semicolonIndex + 1);
            const effectPart = text.substring(semicolonIndex + 1);

            const costOutput = PSCT_SETTINGS.enableCost 
                ? `<span style="color: ${PSCT_SETTINGS.costColor}; font-weight: 500;">${formatCardNames(costPart)}</span>` 
                : formatCardNames(costPart);

            return costOutput + formatCardNames(effectPart);
        }

        return formatCardNames(text);
    }

    /**
     * Splits raw text into sentence blocks based on periods and parenthesis rules.
     */
    function splitIntoSentences(text) {
        const sentences = [];
        let current = "";
        let inQuotes = false;
        let parenDepth = 0;
        let waitingToBreakAfterParen = false;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            current += char;

            if (char === '"' || char === '“' || char === '”') {
                inQuotes = !inQuotes;
            } else if (char === '(' && !inQuotes) {
                parenDepth++;
            } else if (char === ')' && !inQuotes) {
                if (parenDepth > 0) parenDepth--;
                
                if (parenDepth === 0 && waitingToBreakAfterParen) {
                    sentences.push(current);
                    current = "";
                    waitingToBreakAfterParen = false;
                }
            } else if (char === '.' && !inQuotes && parenDepth === 0) {
                let rest = text.substring(i + 1).trimStart();
                
                if (/^(\(Quick Effect\)|\bQuick Effects?\b)/i.test(rest)) {
                    sentences.push(current);
                    current = "";
                    continue;
                }

                if (rest.startsWith('(')) {
                    waitingToBreakAfterParen = true;
                } else if (i === text.length - 1 || text[i + 1] === ' ' || text[i + 1] === '\n') {
                    sentences.push(current);
                    current = "";
                }
            }
        }

        if (current.length > 0) sentences.push(current);
        return sentences;
    }

    /**
     * Orchestrates formatting using fine-tuned line breaks.
     */
    function processText(text) {
        if (!text) return text;

        let cleaned = text.replace(/\u00A0/g, ' ');
        const rawLines = cleaned.split('\n');

        const activeGap = PSCT_SETTINGS.gapEnabled ? PSCT_SETTINGS.spacingGap : 0;
        const customSpacer = `<span style="display: block; margin-top: ${activeGap}px;"></span>`;

        const processedLines = rawLines.map(line => {
            if (!line.trim()) return '';
            
            const sentences = splitIntoSentences(line);
            
            return sentences
                .map(sentence => highlightPSCTInBlock(sentence))
                .filter(s => s && s.length > 0)
                .join(customSpacer);
        });

        return processedLines.filter(b => b.length > 0).join(customSpacer);
    }

    let isProcessing = false;

    /**
     * Clears cache attributes to force immediate UI re-render on settings change.
     */
    function forceReRender() {
        const targetSelectors = ['#card-description', '#engine-card-description', '.card-description'];
        targetSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                element.removeAttribute('data-psct-cache');
                processCardDescription(element);
            });
        });
    }

    /**
     * Processes card container elements.
     */
    function processCardDescription(cardDescription) {
        const rawText = cardDescription.innerText;
        if (!rawText) return;

        const normalizedText = rawText.replace(/\r/g, '').trim();

        if (cardDescription.getAttribute('data-psct-cache') === normalizedText) return;

        cardDescription.setAttribute('data-psct-cache', normalizedText);

        isProcessing = true;
        cardDescription.innerHTML = processText(normalizedText);
        isProcessing = false;
    }

    /**
     * Scans for active containers.
     */
    function findAndProcessContainers() {
        const targetSelectors = [
            '#card-description',
            '#engine-card-description',
            '.card-description'
        ];

        targetSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                processCardDescription(element);
            });
        });
    }

    /**
     * Injects the complete PSCT Settings UI with toggles and options.
     */
    function injectPSCTSettingsUI() {
        if (document.getElementById('psct-settings-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'psct-settings-btn';
        btn.innerText = '⚙️ PSCT Settings';
        btn.style.cssText = `
            position: fixed;
            bottom: 15px;
            right: 15px;
            z-index: 99999;
            background: #282a36;
            color: #f8f8f2;
            border: 1px solid #6272a4;
            border-radius: 6px;
            padding: 8px 12px;
            font-size: 13px;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
            transition: background 0.2s;
        `;
        btn.onmouseover = () => btn.style.background = '#44475a';
        btn.onmouseout = () => btn.style.background = '#282a36';

        const panel = document.createElement('div');
        panel.id = 'psct-settings-panel';
        panel.style.cssText = `
            position: fixed;
            bottom: 55px;
            right: 15px;
            z-index: 99999;
            background: #282a36;
            color: #f8f8f2;
            border: 1px solid #6272a4;
            border-radius: 8px;
            padding: 15px;
            display: none;
            flex-direction: column;
            gap: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            font-family: sans-serif;
            font-size: 13px;
            min-width: 290px;
        `;

        panel.innerHTML = `
            <div style="font-weight: bold; border-bottom: 1px solid #6272a4; padding-bottom: 5px;">
                PSCT Format & Colors
            </div>

            <!-- Master Color Toggle -->
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <label for="psct-toggle-colors">Enable All PSCT Colors:</label>
                <input type="checkbox" id="psct-toggle-colors" ${PSCT_SETTINGS.enableColors ? 'checked' : ''} style="cursor: pointer;">
            </div>

            <!-- Summon Condition Color Control (Moved Above Condition) -->
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <input type="checkbox" id="psct-toggle-summon" ${PSCT_SETTINGS.enableSummon ? 'checked' : ''} style="cursor: pointer;" title="Toggle Summon Condition Color">
                    <label for="psct-summon-color">Summon Condition:</label>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <input type="color" id="psct-summon-color" value="${PSCT_SETTINGS.summonColor}" style="cursor: pointer; border: none; background: transparent; width: 26px; height: 26px;">
                    <button id="psct-reset-summon" title="Reset Summon Color" style="background: #44475a; color: #f8f8f2; border: 1px solid #6272a4; border-radius: 3px; width: 22px; height: 22px; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center;">↺</button>
                </div>
            </div>

            <!-- Condition Color Control -->
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <input type="checkbox" id="psct-toggle-cond" ${PSCT_SETTINGS.enableCondition ? 'checked' : ''} style="cursor: pointer;" title="Toggle Condition Color">
                    <label for="psct-cond-color">Condition (:):</label>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <input type="color" id="psct-cond-color" value="${PSCT_SETTINGS.conditionColor}" style="cursor: pointer; border: none; background: transparent; width: 26px; height: 26px;">
                    <button id="psct-reset-cond" title="Reset Condition Color" style="background: #44475a; color: #f8f8f2; border: 1px solid #6272a4; border-radius: 3px; width: 22px; height: 22px; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center;">↺</button>
                </div>
            </div>

            <!-- Cost Color Control -->
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <input type="checkbox" id="psct-toggle-cost" ${PSCT_SETTINGS.enableCost ? 'checked' : ''} style="cursor: pointer;" title="Toggle Cost Color">
                    <label for="psct-cost-color">Cost (;):</label>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <input type="color" id="psct-cost-color" value="${PSCT_SETTINGS.costColor}" style="cursor: pointer; border: none; background: transparent; width: 26px; height: 26px;">
                    <button id="psct-reset-cost" title="Reset Cost Color" style="background: #44475a; color: #f8f8f2; border: 1px solid #6272a4; border-radius: 3px; width: 22px; height: 22px; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center;">↺</button>
                </div>
            </div>

            <hr style="border: 0; border-top: 1px solid #44475a; margin: 2px 0;">

            <!-- Enable Italic Card Names Toggle -->
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <label for="psct-toggle-names" style="font-style: italic;">Italics for Card Names ("..."):</label>
                <input type="checkbox" id="psct-toggle-names" ${PSCT_SETTINGS.enableCardNames ? 'checked' : ''} style="cursor: pointer;">
            </div>

            <!-- Enable Bold Quick Effect Toggle -->
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <label for="psct-toggle-quick" style="font-weight: bold;">Bold Quick Effects:</label>
                <input type="checkbox" id="psct-toggle-quick" ${PSCT_SETTINGS.enableQuickEffect ? 'checked' : ''} style="cursor: pointer;">
            </div>

            <hr style="border: 0; border-top: 1px solid #44475a; margin: 2px 0;">

            <!-- Toggle Spacing Gap On/Off -->
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <label for="psct-toggle-gap">Enable Spacing Gap:</label>
                <input type="checkbox" id="psct-toggle-gap" ${PSCT_SETTINGS.gapEnabled ? 'checked' : ''} style="cursor: pointer;">
            </div>

            <!-- Custom Gap Size Controls -->
            <div id="psct-gap-container" style="display: flex; flex-direction: column; gap: 6px; background: #1e1f29; padding: 8px; border-radius: 4px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label for="psct-gap-input">Gap Size (px):</label>
                    <input type="number" id="psct-gap-input" value="${PSCT_SETTINGS.spacingGap}" min="0" max="50" style="width: 50px; background: #282a36; color: #f8f8f2; border: 1px solid #6272a4; border-radius: 3px; padding: 2px 4px;">
                </div>
                <button id="psct-reset-gap" style="
                    background: #44475a;
                    color: #f8f8f2;
                    border: 1px solid #6272a4;
                    border-radius: 4px;
                    padding: 3px 6px;
                    font-size: 11px;
                    cursor: pointer;
                    align-self: flex-end;
                    transition: background 0.2s;
                ">↺ Reset Gap to Default</button>
            </div>
        `;

        document.body.appendChild(btn);
        document.body.appendChild(panel);

        // Toggle panel open/close
        btn.addEventListener('click', () => {
            panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
        });

        // UI Event Listeners
        const toggleColors = document.getElementById('psct-toggle-colors');
        const toggleCond = document.getElementById('psct-toggle-cond');
        const condInput = document.getElementById('psct-cond-color');
        const resetCondBtn = document.getElementById('psct-reset-cond');

        const toggleCost = document.getElementById('psct-toggle-cost');
        const costInput = document.getElementById('psct-cost-color');
        const resetCostBtn = document.getElementById('psct-reset-cost');

        const toggleSummon = document.getElementById('psct-toggle-summon');
        const summonInput = document.getElementById('psct-summon-color');
        const resetSummonBtn = document.getElementById('psct-reset-summon');

        const toggleNames = document.getElementById('psct-toggle-names');
        const toggleQuick = document.getElementById('psct-toggle-quick');
        const toggleGap = document.getElementById('psct-toggle-gap');
        const gapInput = document.getElementById('psct-gap-input');
        const resetGapBtn = document.getElementById('psct-reset-gap');

        toggleColors.addEventListener('change', (e) => {
            PSCT_SETTINGS.enableColors = e.target.checked;
            localStorage.setItem(STORAGE_KEY_ENABLE_COLORS, e.target.checked);
            forceReRender();
        });

        toggleCond.addEventListener('change', (e) => {
            PSCT_SETTINGS.enableCondition = e.target.checked;
            localStorage.setItem(STORAGE_KEY_ENABLE_CONDITION, e.target.checked);
            forceReRender();
        });

        condInput.addEventListener('input', (e) => {
            PSCT_SETTINGS.conditionColor = e.target.value;
            localStorage.setItem(STORAGE_KEY_CONDITION, e.target.value);
            forceReRender();
        });

        resetCondBtn.addEventListener('click', () => {
            PSCT_SETTINGS.conditionColor = DEFAULT_CONDITION_COLOR;
            localStorage.setItem(STORAGE_KEY_CONDITION, DEFAULT_CONDITION_COLOR);
            condInput.value = DEFAULT_CONDITION_COLOR;
            forceReRender();
        });

        toggleCost.addEventListener('change', (e) => {
            PSCT_SETTINGS.enableCost = e.target.checked;
            localStorage.setItem(STORAGE_KEY_ENABLE_COST, e.target.checked);
            forceReRender();
        });

        costInput.addEventListener('input', (e) => {
            PSCT_SETTINGS.costColor = e.target.value;
            localStorage.setItem(STORAGE_KEY_COST, e.target.value);
            forceReRender();
        });

        resetCostBtn.addEventListener('click', () => {
            PSCT_SETTINGS.costColor = DEFAULT_COST_COLOR;
            localStorage.setItem(STORAGE_KEY_COST, DEFAULT_COST_COLOR);
            costInput.value = DEFAULT_COST_COLOR;
            forceReRender();
        });

        toggleSummon.addEventListener('change', (e) => {
            PSCT_SETTINGS.enableSummon = e.target.checked;
            localStorage.setItem(STORAGE_KEY_ENABLE_SUMMON, e.target.checked);
            forceReRender();
        });

        summonInput.addEventListener('input', (e) => {
            PSCT_SETTINGS.summonColor = e.target.value;
            localStorage.setItem(STORAGE_KEY_SUMMON, e.target.value);
            forceReRender();
        });

        resetSummonBtn.addEventListener('click', () => {
            PSCT_SETTINGS.summonColor = DEFAULT_SUMMON_COLOR;
            localStorage.setItem(STORAGE_KEY_SUMMON, DEFAULT_SUMMON_COLOR);
            summonInput.value = DEFAULT_SUMMON_COLOR;
            forceReRender();
        });

        toggleNames.addEventListener('change', (e) => {
            PSCT_SETTINGS.enableCardNames = e.target.checked;
            localStorage.setItem(STORAGE_KEY_ENABLE_NAMES, e.target.checked);
            forceReRender();
        });

        toggleQuick.addEventListener('change', (e) => {
            PSCT_SETTINGS.enableQuickEffect = e.target.checked;
            localStorage.setItem(STORAGE_KEY_ENABLE_QUICK, e.target.checked);
            forceReRender();
        });

        toggleGap.addEventListener('change', (e) => {
            PSCT_SETTINGS.gapEnabled = e.target.checked;
            localStorage.setItem(STORAGE_KEY_GAP_ENABLED, e.target.checked);
            forceReRender();
        });

        gapInput.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10) || 0;
            PSCT_SETTINGS.spacingGap = val;
            localStorage.setItem(STORAGE_KEY_SPACING_GAP, val);
            forceReRender();
        });

        resetGapBtn.addEventListener('click', () => {
            PSCT_SETTINGS.spacingGap = DEFAULT_SPACING_GAP;
            localStorage.setItem(STORAGE_KEY_SPACING_GAP, DEFAULT_SPACING_GAP);
            gapInput.value = DEFAULT_SPACING_GAP;
            forceReRender();
        });
    }

    /**
     * Observes global DOM changes.
     */
    function setupGlobalObserver() {
        const observer = new MutationObserver(() => {
            if (isProcessing) return;
            findAndProcessContainers();
            injectPSCTSettingsUI();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });

        findAndProcessContainers();
        injectPSCTSettingsUI();
    }

    // Initialize execution when the page DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupGlobalObserver);
    } else {
        setupGlobalObserver();
    }
})();
