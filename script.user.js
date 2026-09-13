// ==UserScript==
// @name         DuelingNexus - PSCT Color Highlighter & Formatter
// @namespace    https://github.com/LiatDrazil
// @version      2.9.38
// @description  Highlights PSCT conditions, costs, and summon conditions, formats card names, Quick Effects, use Limits restrictions (once per turn / duel), with custom spacing controls.
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

    // ==========================================
    // 1. DEFAULT VALUES & STORAGE KEYS SETUP
    // ==========================================
    
    // Default color used for highlighting PSCT Conditions (colon syntax)
    const DEFAULT_CONDITION_COLOR = '#F1FA8C';
    
    // Default color used for highlighting PSCT Activation Costs (semicolon syntax)
    const DEFAULT_COST_COLOR = '#FF79C6';
    
    // Default color used for highlighting Summon Conditions (Cyan style)
    const DEFAULT_SUMMON_COLOR = '#8BE9FD'; 
    
    // Default spacing gap size in pixels between processed lines/sentences
    const DEFAULT_SPACING_GAP = 10;

    // Storage keys for persisting user preferences in localStorage
    const STORAGE_KEYS = {
        condition: 'psct_color_condition',
        cost: 'psct_color_cost',
        summon: 'psct_color_summon',
        enableColors: 'psct_enable_colors',
        enableCondition: 'psct_enable_condition',
        enableCost: 'psct_enable_cost',
        enableSummon: 'psct_enable_summon',
        enableNames: 'psct_enable_names',
        enableQuick: 'psct_enable_quick',
        enableUseLimits: 'psct_enable_use_limits',
        spacingGap: 'psct_spacing_gap',
        gapEnabled: 'psct_gap_enabled'
    };

    // Target selectors for card description containers (constant, reused)
    const CARD_DESCRIPTION_SELECTORS = [
        '#card-description',
        '#engine-card-description',
        '.card-description'
    ];

    // Quote character set for consistent handling
    const QUOTE_CHARS = ['"', '"', '"'];

    // Initialize state from localStorage or fallback to defaults
    let PSCT_SETTINGS = {
        conditionColor: localStorage.getItem(STORAGE_KEYS.condition) || DEFAULT_CONDITION_COLOR,
        costColor: localStorage.getItem(STORAGE_KEYS.cost) || DEFAULT_COST_COLOR,
        summonColor: localStorage.getItem(STORAGE_KEYS.summon) || DEFAULT_SUMMON_COLOR,
        enableColors: localStorage.getItem(STORAGE_KEYS.enableColors) !== 'false',
        enableCondition: localStorage.getItem(STORAGE_KEYS.enableCondition) !== 'false',
        enableCost: localStorage.getItem(STORAGE_KEYS.enableCost) !== 'false',
        enableSummon: localStorage.getItem(STORAGE_KEYS.enableSummon) !== 'false',
        enableCardNames: localStorage.getItem(STORAGE_KEYS.enableNames) !== 'false',
        enableQuickEffect: localStorage.getItem(STORAGE_KEYS.enableQuick) !== 'false',
        enableUseLimits: localStorage.getItem(STORAGE_KEYS.enableUseLimits) !== 'false',
        spacingGap: parseInt(localStorage.getItem(STORAGE_KEYS.spacingGap) || DEFAULT_SPACING_GAP, 10),
        gapEnabled: localStorage.getItem(STORAGE_KEYS.gapEnabled) !== 'false'
    };

    let isProcessing = false;
    let processingTimer = null;

    /**
     * Validates if a string is a valid hex color.
     */
    function isValidColor(color) {
        const style = new Option().style;
        style.color = color;
        return style.color !== '';
    }

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
     * Finds the index of a PSCT punctuation mark (':' or ';') within a string,
     * ignoring matches inside quotes to avoid false positives.
     */
    function findPSCTPunctuation(str, char) {
        let inQuotes = false;

        for (let i = 0; i < str.length; i++) {
            const current = str[i];
            
            if (QUOTE_CHARS.includes(current)) {
                inQuotes = !inQuotes;
            } else if (current === char && !inQuotes) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Replaces quoted text (card names), Quick Effect mentions, use limit conditions, and use limit clauses with appropriate styles.
     */
    function formatCardNames(text) {
        if (!text) return "";
        let escaped = escapeHTML(text);

        // Apply italic styling to text enclosed in quotes (card names)
        if (PSCT_SETTINGS.enableCardNames) {
            escaped = escaped.replace(/(?:"|"|")(.*?)(?:"|"|")/g, (match, name) => {
                return `<span style="font-style: italic;">"${name}"</span>`;
            });
        }

        // Apply bold styling to Quick Effect indicators
        if (PSCT_SETTINGS.enableQuickEffect) {
            escaped = escaped.replace(/(\(Quick Effect\)|\bQuick Effects?\b)/gi, '<strong style="font-weight: bold;">$1</strong>');
        }

        // Apply underline styling to use limit clauses (including "once per turn / duel" variants)
        if (PSCT_SETTINGS.enableUseLimits) {
            const useLimitsRegex = /\b(?:once|twice|thrice|(?:[\w\d]+|a\s+number\s+of)\s+times?)\s+per\s+(?:turn|duel|phase)\b/gi;
            escaped = escaped.replace(useLimitsRegex, (match) => {
                return `<span style="text-decoration: underline;">${match}</span>`;
            });
        }

        return escaped;
    }

    /**
     * Checks if a sentence represents or contains a Summon Condition.
     */
    function isSummonCondition(text) {
        if (!text) return false;
        
        const lower = text.trim().toLowerCase();

        // If it contains a semicolon (;), it is an activation cost, never a summon condition.
        if (text.includes(';')) return false;

        // If it contains a colon (:), check if it's an activated effect condition (e.g., "Once per turn, during your Main Phase: You can...")
        // Summon conditions do not use a colon for activation timing/costs.
        if (text.includes(':')) {
            const colonIndex = findPSCTPunctuation(text, ':');
            // If there's a colon and it precedes a typical activation setup ("you can", activation phrasing, etc.), it's an effect.
            const textBeforeColon = lower.substring(0, colonIndex);
            const activationKeywords = ["turn", "phase", "ready", "standby", "main"];
            if (activationKeywords.some(keyword => textBeforeColon.includes(keyword))) {
                return false;
            }
            if (!lower.includes("summon")) return false;
        }

        // Must contain the word "by" as a whole word to be evaluated
        const hasBy = /\bby\b/.test(lower);
        if (!hasBy) return false;

        // Strip/remove invalid "by" occurrences to check if at least one valid "by" remains
        let cleanedLower = lower
            .replace(/by\s+its\s+own\s+effect/g, '')
            .replace(/by\s+other\s+ways/g, '')
            .replace(/by\s+(?:[""].*?[""])/g, '');

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
     * Formats summon conditions with custom color and weight.
     */
    function formatSummonCondition(text) {
        if (!PSCT_SETTINGS.enableColors || !PSCT_SETTINGS.enableSummon) return formatCardNames(text);

        return `<span style="color: ${PSCT_SETTINGS.summonColor}; font-weight: 500;">${formatCardNames(text)}</span>`;
    }

    // ==========================================
    // 2. PSCT HIGHLIGHTING CORE LOGIC
    // ==========================================
    /**
     * Wraps conditions, costs, summon conditions, and full use limit sentences in custom tags.
     */
    function highlightPSCTInBlock(text) {
        if (!text || !text.trim()) return text;

        // Check if block matches Summon Condition rules first
        if (isSummonCondition(text)) {
            return formatSummonCondition(text);
        }

        // Check if this block has condition (:) or cost (;)
        const colonIndex = findPSCTPunctuation(text, ':');
        const semicolonIndex = findPSCTPunctuation(text, ';');
        const hasConditionOrCost = (colonIndex !== -1 || semicolonIndex !== -1);

        // If enabled, check for "You can only use/activate/apply ..." use limits
        if (PSCT_SETTINGS.enableUseLimits && !hasConditionOrCost) {
            const lower = text.toLowerCase();
            if (/\byou\s+can\s+only\s+(?:use|activate|apply)\b/.test(lower)) {
                return `<span style="text-decoration: underline;">${formatCardNames(text)}</span>`;
            }
        }

        if (!PSCT_SETTINGS.enableColors) return formatCardNames(text);

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

            if (QUOTE_CHARS.includes(char)) {
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
     * Orchestrates formatting using fine-tuned line breaks and spacing gaps.
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

    /**
     * Creates a cache key combining normalized text and settings hash.
     */
    function getSettingsHash() {
        return JSON.stringify({
            enableColors: PSCT_SETTINGS.enableColors,
            enableCondition: PSCT_SETTINGS.enableCondition,
            enableCost: PSCT_SETTINGS.enableCost,
            enableSummon: PSCT_SETTINGS.enableSummon,
            enableCardNames: PSCT_SETTINGS.enableCardNames,
            enableQuickEffect: PSCT_SETTINGS.enableQuickEffect,
            enableUseLimits: PSCT_SETTINGS.enableUseLimits,
            gapEnabled: PSCT_SETTINGS.gapEnabled,
            spacingGap: PSCT_SETTINGS.spacingGap,
            conditionColor: PSCT_SETTINGS.conditionColor,
            costColor: PSCT_SETTINGS.costColor,
            summonColor: PSCT_SETTINGS.summonColor
        });
    }

    /**
     * Clears cache attributes to force immediate UI re-render on settings change.
     */
    function forceReRender() {
        CARD_DESCRIPTION_SELECTORS.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                element.removeAttribute('data-psct-cache');
                processCardDescription(element);
            });
        });
    }

    /**
     * Processes card container elements and caches inner text and settings to prevent redundant processing.
     */
    function processCardDescription(cardDescription) {
        if (!cardDescription) return;

        const rawText = cardDescription.innerText;
        if (!rawText) return;

        const normalizedText = rawText.replace(/\r/g, '').trim();
        const settingsHash = getSettingsHash();
        const combinedCache = `${normalizedText}|${settingsHash}`;

        if (cardDescription.getAttribute('data-psct-cache') === combinedCache) return;

        cardDescription.setAttribute('data-psct-cache', combinedCache);

        isProcessing = true;
        try {
            cardDescription.innerHTML = processText(normalizedText);
        } catch (error) {
            console.error('Error processing card description:', error);
        } finally {
            isProcessing = false;
        }
    }

    /**
     * Scans for active card containers across the document.
     */
    function findAndProcessContainers() {
        CARD_DESCRIPTION_SELECTORS.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                processCardDescription(element);
            });
        });
    }

    // ==========================================
    // 3. SETTINGS UI & EVENT LISTENERS
    // ==========================================

    /**
     * Build the settings UI HTML template.
     */
    function getSettingsUIHTML() {
        return `
            <div style="font-weight: bold; border-bottom: 1px solid #6272a4; padding-bottom: 5px;">
                PSCT Format & Colors
            </div>

            <!-- Master Color Toggle -->
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <label for="psct-toggle-colors">Enable All PSCT Colors:</label>
                <input type="checkbox" id="psct-toggle-colors" ${PSCT_SETTINGS.enableColors ? 'checked' : ''} style="cursor: pointer;">
            </div>

            <!-- Summon Condition Color Control -->
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <input type="checkbox" id="psct-toggle-summon" ${PSCT_SETTINGS.enableSummon ? 'checked' : ''} style="cursor: pointer;" title="Toggle Summon Condition Color">
                    <label for="psct-summon-color">Summon Condition:</label>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <input type="color" id="psct-summon-color" value="${PSCT_SETTINGS.summonColor}" style="cursor: pointer; border: none; background: transparent; width: 26px; height: 26px;">
                    <button id="psct-reset-summon" title="Reset Summon Color" style="background: #44475a; color: #f8f8f2; border: 1px solid #6272a4; border-radius: 3px; width: 22px; height: 22px; font-size: 10px; cursor: pointer; padding: 0; display: flex; align-items: center; justify-content: center;">↺</button>
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
                    <button id="psct-reset-cond" title="Reset Condition Color" style="background: #44475a; color: #f8f8f2; border: 1px solid #6272a4; border-radius: 3px; width: 22px; height: 22px; font-size: 10px; cursor: pointer; padding: 0; display: flex; align-items: center; justify-content: center;">↺</button>
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
                    <button id="psct-reset-cost" title="Reset Cost Color" style="background: #44475a; color: #f8f8f2; border: 1px solid #6272a4; border-radius: 3px; width: 22px; height: 22px; font-size: 10px; cursor: pointer; padding: 0; display: flex; align-items: center; justify-content: center;">↺</button>
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

            <!-- Enable Underline Use Limits Toggle -->
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <label for="psct-toggle-use-limits" style="text-decoration: underline;">Underline use Limits (once per turn / duel):</label>
                <input type="checkbox" id="psct-toggle-use-limits" ${PSCT_SETTINGS.enableUseLimits ? 'checked' : ''} style="cursor: pointer;">
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
    }

    /**
     * Creates and returns event listener binding configuration.
     */
    function createEventListenerBindings(panel) {
        return {
            colors: document.getElementById('psct-toggle-colors'),
            condition: document.getElementById('psct-toggle-cond'),
            conditionColor: document.getElementById('psct-cond-color'),
            conditionReset: document.getElementById('psct-reset-cond'),
            cost: document.getElementById('psct-toggle-cost'),
            costColor: document.getElementById('psct-cost-color'),
            costReset: document.getElementById('psct-reset-cost'),
            summon: document.getElementById('psct-toggle-summon'),
            summonColor: document.getElementById('psct-summon-color'),
            summonReset: document.getElementById('psct-reset-summon'),
            names: document.getElementById('psct-toggle-names'),
            quick: document.getElementById('psct-toggle-quick'),
            useLimits: document.getElementById('psct-toggle-use-limits'),
            gap: document.getElementById('psct-toggle-gap'),
            gapInput: document.getElementById('psct-gap-input'),
            gapReset: document.getElementById('psct-reset-gap')
        };
    }

    /**
     * Registers event listeners for all UI controls.
     */
    function attachEventListeners(bindings) {
        // Master colors toggle
        bindings.colors.addEventListener('change', (e) => {
            PSCT_SETTINGS.enableColors = e.target.checked;
            localStorage.setItem(STORAGE_KEYS.enableColors, e.target.checked);
            forceReRender();
        });

        // Condition controls
        bindings.condition.addEventListener('change', (e) => {
            PSCT_SETTINGS.enableCondition = e.target.checked;
            localStorage.setItem(STORAGE_KEYS.enableCondition, e.target.checked);
            forceReRender();
        });

        bindings.conditionColor.addEventListener('input', (e) => {
            if (isValidColor(e.target.value)) {
                PSCT_SETTINGS.conditionColor = e.target.value;
                localStorage.setItem(STORAGE_KEYS.condition, e.target.value);
                forceReRender();
            }
        });

        bindings.conditionReset.addEventListener('click', () => {
            PSCT_SETTINGS.conditionColor = DEFAULT_CONDITION_COLOR;
            localStorage.setItem(STORAGE_KEYS.condition, DEFAULT_CONDITION_COLOR);
            bindings.conditionColor.value = DEFAULT_CONDITION_COLOR;
            forceReRender();
        });

        // Cost controls
        bindings.cost.addEventListener('change', (e) => {
            PSCT_SETTINGS.enableCost = e.target.checked;
            localStorage.setItem(STORAGE_KEYS.enableCost, e.target.checked);
            forceReRender();
        });

        bindings.costColor.addEventListener('input', (e) => {
            if (isValidColor(e.target.value)) {
                PSCT_SETTINGS.costColor = e.target.value;
                localStorage.setItem(STORAGE_KEYS.cost, e.target.value);
                forceReRender();
            }
        });

        bindings.costReset.addEventListener('click', () => {
            PSCT_SETTINGS.costColor = DEFAULT_COST_COLOR;
            localStorage.setItem(STORAGE_KEYS.cost, DEFAULT_COST_COLOR);
            bindings.costColor.value = DEFAULT_COST_COLOR;
            forceReRender();
        });

        // Summon controls
        bindings.summon.addEventListener('change', (e) => {
            PSCT_SETTINGS.enableSummon = e.target.checked;
            localStorage.setItem(STORAGE_KEYS.enableSummon, e.target.checked);
            forceReRender();
        });

        bindings.summonColor.addEventListener('input', (e) => {
            if (isValidColor(e.target.value)) {
                PSCT_SETTINGS.summonColor = e.target.value;
                localStorage.setItem(STORAGE_KEYS.summon, e.target.value);
                forceReRender();
            }
        });

        bindings.summonReset.addEventListener('click', () => {
            PSCT_SETTINGS.summonColor = DEFAULT_SUMMON_COLOR;
            localStorage.setItem(STORAGE_KEYS.summon, DEFAULT_SUMMON_COLOR);
            bindings.summonColor.value = DEFAULT_SUMMON_COLOR;
            forceReRender();
        });

        // Formatting options
        bindings.names.addEventListener('change', (e) => {
            PSCT_SETTINGS.enableCardNames = e.target.checked;
            localStorage.setItem(STORAGE_KEYS.enableNames, e.target.checked);
            forceReRender();
        });

        bindings.quick.addEventListener('change', (e) => {
            PSCT_SETTINGS.enableQuickEffect = e.target.checked;
            localStorage.setItem(STORAGE_KEYS.enableQuick, e.target.checked);
            forceReRender();
        });

        bindings.useLimits.addEventListener('change', (e) => {
            PSCT_SETTINGS.enableUseLimits = e.target.checked;
            localStorage.setItem(STORAGE_KEYS.enableUseLimits, e.target.checked);
            forceReRender();
        });

        // Gap controls
        bindings.gap.addEventListener('change', (e) => {
            PSCT_SETTINGS.gapEnabled = e.target.checked;
            localStorage.setItem(STORAGE_KEYS.gapEnabled, e.target.checked);
            forceReRender();
        });

        bindings.gapInput.addEventListener('input', (e) => {
            const val = Math.max(0, Math.min(50, parseInt(e.target.value, 10) || 0));
            PSCT_SETTINGS.spacingGap = val;
            localStorage.setItem(STORAGE_KEYS.spacingGap, val);
            forceReRender();
        });

        bindings.gapReset.addEventListener('click', () => {
            PSCT_SETTINGS.spacingGap = DEFAULT_SPACING_GAP;
            localStorage.setItem(STORAGE_KEYS.spacingGap, DEFAULT_SPACING_GAP);
            bindings.gapInput.value = DEFAULT_SPACING_GAP;
            forceReRender();
        });
    }

    /**
     * Injects the complete PSCT Settings UI floating panel with toggles and color pickers.
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
            max-height: 80vh;
            overflow-y: auto;
        `;

        panel.innerHTML = getSettingsUIHTML();

        document.body.appendChild(btn);
        document.body.appendChild(panel);

        // Toggle settings panel visibility
        btn.addEventListener('click', () => {
            panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
        });

        // Close panel on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && panel.style.display !== 'none') {
                panel.style.display = 'none';
            }
        });

        // Attach event listeners to all controls
        const bindings = createEventListenerBindings(panel);
        attachEventListeners(bindings);
    }

    // ==========================================
    // 4. MUTATION OBSERVER & INITIALIZATION
    // ==========================================
    /**
     * Sets up a global MutationObserver to continuously scan and format dynamically loaded card descriptions.
     * Uses debouncing to avoid excessive processing.
     */
    function setupGlobalObserver() {
        const observer = new MutationObserver(() => {
            if (isProcessing || processingTimer) return;
            
            processingTimer = setTimeout(() => {
                findAndProcessContainers();
                injectPSCTSettingsUI();
                processingTimer = null;
            }, 300); // Debounce by 300ms
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
