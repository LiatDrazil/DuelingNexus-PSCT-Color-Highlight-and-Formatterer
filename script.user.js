// ==UserScript==
// @name         DuelingNexus - PSCT Color Highlighter & Formatter
// @namespace    https://github.com/LiatDrazil
// @version      2.6.0
// @description  Highlights PSCT conditions/costs, italicizes card names, and provides custom line spacing controls
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
    const DEFAULT_SPACING_GAP = 10;

    // Storage keys for user settings
    const STORAGE_KEY_CONDITION = 'psct_color_condition';
    const STORAGE_KEY_COST = 'psct_color_cost';
    const STORAGE_KEY_ENABLE_COLORS = 'psct_enable_colors';
    const STORAGE_KEY_ENABLE_NAMES = 'psct_enable_names';
    const STORAGE_KEY_SPACING_GAP = 'psct_spacing_gap';
    const STORAGE_KEY_GAP_ENABLED = 'psct_gap_enabled';

    // Settings state initialized from localStorage
    let PSCT_SETTINGS = {
        conditionColor: localStorage.getItem(STORAGE_KEY_CONDITION) || DEFAULT_CONDITION_COLOR,
        costColor: localStorage.getItem(STORAGE_KEY_COST) || DEFAULT_COST_COLOR,
        enableColors: localStorage.getItem(STORAGE_KEY_ENABLE_COLORS) !== 'false',
        enableCardNames: localStorage.getItem(STORAGE_KEY_ENABLE_NAMES) !== 'false',
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
     * Replaces quoted text (card names) with italicized HTML spans if enabled (without changing color).
     */
    function formatCardNames(text) {
        if (!PSCT_SETTINGS.enableCardNames || !text) return escapeHTML(text);

        return escapeHTML(text).replace(/(?:"|“)(.*?)(?:"|”)/g, (match, name) => {
            return `<span style="font-style: italic;">"${name}"</span>`;
        });
    }

    /**
     * Wraps conditions and costs in custom-colored HTML <span> tags if colors are enabled.
     */
    function highlightPSCTInBlock(text) {
        if (!text || !text.trim()) return text;
        if (!PSCT_SETTINGS.enableColors) return formatCardNames(text);

        const colonIndex = findPSCTPunctuation(text, ':');
        const semicolonIndex = findPSCTPunctuation(text, ';');

        // Case 1: Both Condition (:) and Cost (;) are present
        if (colonIndex !== -1 && semicolonIndex !== -1 && colonIndex < semicolonIndex) {
            const conditionPart = text.substring(0, colonIndex + 1);
            const costPart = text.substring(colonIndex + 1, semicolonIndex + 1);
            const effectPart = text.substring(semicolonIndex + 1);

            return `<span style="color: ${PSCT_SETTINGS.conditionColor}; font-weight: 500;">${formatCardNames(conditionPart)}</span>` +
                   `<span style="color: ${PSCT_SETTINGS.costColor}; font-weight: 500;">${formatCardNames(costPart)}</span>` +
                   formatCardNames(effectPart);
        }
        // Case 2: Only Condition (:) is present
        else if (colonIndex !== -1) {
            const conditionPart = text.substring(0, colonIndex + 1);
            const effectPart = text.substring(colonIndex + 1);

            return `<span style="color: ${PSCT_SETTINGS.conditionColor}; font-weight: 500;">${formatCardNames(conditionPart)}</span>` +
                   formatCardNames(effectPart);
        }
        // Case 3: Only Cost (;) is present
        else if (semicolonIndex !== -1) {
            const costPart = text.substring(0, semicolonIndex + 1);
            const effectPart = text.substring(semicolonIndex + 1);

            return `<span style="color: ${PSCT_SETTINGS.costColor}; font-weight: 500;">${formatCardNames(costPart)}</span>` +
                   formatCardNames(effectPart);
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

                if (rest.startsWith('(Quick Effect)')) {
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
            min-width: 250px;
        `;

        panel.innerHTML = `
            <div style="font-weight: bold; border-bottom: 1px solid #6272a4; padding-bottom: 5px;">
                PSCT Format & Colors
            </div>

            <!-- Enable Highlights Toggle -->
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <label for="psct-toggle-colors">Enable PSCT Colors:</label>
                <input type="checkbox" id="psct-toggle-colors" ${PSCT_SETTINGS.enableColors ? 'checked' : ''} style="cursor: pointer;">
            </div>

            <!-- Condition Color Picker -->
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <label for="psct-cond-color">Condition (:):</label>
                <input type="color" id="psct-cond-color" value="${PSCT_SETTINGS.conditionColor}" style="cursor: pointer; border: none; background: transparent; width: 30px; height: 30px;">
            </div>

            <!-- Cost Color Picker -->
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <label for="psct-cost-color">Cost (;):</label>
                <input type="color" id="psct-cost-color" value="${PSCT_SETTINGS.costColor}" style="cursor: pointer; border: none; background: transparent; width: 30px; height: 30px;">
            </div>

            <!-- Reset Colors Button -->
            <button id="psct-reset-colors" style="
                background: #44475a;
                color: #f8f8f2;
                border: 1px solid #6272a4;
                border-radius: 4px;
                padding: 4px 8px;
                font-size: 11px;
                cursor: pointer;
                transition: background 0.2s;
            ">↺ Reset Colors to Default</button>

            <hr style="border: 0; border-top: 1px solid #44475a; margin: 2px 0;">

            <!-- Enable Italic Card Names Toggle -->
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <label for="psct-toggle-names">Italics for Card Names ("..."):</label>
                <input type="checkbox" id="psct-toggle-names" ${PSCT_SETTINGS.enableCardNames ? 'checked' : ''} style="cursor: pointer;">
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
        const condInput = document.getElementById('psct-cond-color');
        const costInput = document.getElementById('psct-cost-color');
        const resetColorsBtn = document.getElementById('psct-reset-colors');
        const toggleNames = document.getElementById('psct-toggle-names');
        const toggleGap = document.getElementById('psct-toggle-gap');
        const gapInput = document.getElementById('psct-gap-input');
        const resetGapBtn = document.getElementById('psct-reset-gap');

        toggleColors.addEventListener('change', (e) => {
            PSCT_SETTINGS.enableColors = e.target.checked;
            localStorage.setItem(STORAGE_KEY_ENABLE_COLORS, e.target.checked);
            forceReRender();
        });

        condInput.addEventListener('input', (e) => {
            PSCT_SETTINGS.conditionColor = e.target.value;
            localStorage.setItem(STORAGE_KEY_CONDITION, e.target.value);
            forceReRender();
        });

        costInput.addEventListener('input', (e) => {
            PSCT_SETTINGS.costColor = e.target.value;
            localStorage.setItem(STORAGE_KEY_COST, e.target.value);
            forceReRender();
        });

        resetColorsBtn.addEventListener('click', () => {
            PSCT_SETTINGS.conditionColor = DEFAULT_CONDITION_COLOR;
            PSCT_SETTINGS.costColor = DEFAULT_COST_COLOR;

            localStorage.setItem(STORAGE_KEY_CONDITION, DEFAULT_CONDITION_COLOR);
            localStorage.setItem(STORAGE_KEY_COST, DEFAULT_COST_COLOR);

            condInput.value = DEFAULT_CONDITION_COLOR;
            costInput.value = DEFAULT_COST_COLOR;

            forceReRender();
        });

        toggleNames.addEventListener('change', (e) => {
            PSCT_SETTINGS.enableCardNames = e.target.checked;
            localStorage.setItem(STORAGE_KEY_ENABLE_NAMES, e.target.checked);
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
