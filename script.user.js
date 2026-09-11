// ==UserScript==
// @name         DuelingNexus - PSCT Color Highlighter
// @namespace    https://github.com/LiatDrazil
// @version      1.5.0
// @description  Highlights PSCT conditions and costs with dark-theme friendly colors
// @author       LiatDrazil
// @match        https://duelingnexus.com/duel/*
// @match        https://duelingnexus.com/replay/*
// @match        https://duelingnexus.com/game/*
// @match        https://duelingnexus.com/editor/*
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/LiatDrazil/DuelingNexus-PSCT-Color-Highlighter/main/script.user.js
// @updateURL    https://raw.githubusercontent.com/LiatDrazil/DuelingNexus-PSCT-Color-Highlighter/main/script.user.js
// ==/UserScript==

(function () {
    'use strict';

    // ============================================
    // COLOR PALETTE (Dark-Theme Friendly)
    // ============================================
    const PSCT_COLORS = {
        condition: '#F1FA8C', // Soft Pastel Yellow (Condition before ":")
        cost: '#FF79C6'       // Soft Pastel Pink/Magenta (Cost before ";")
    };

    // Escape HTML characters for safety
    function escapeHTML(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    // Helper to find punctuation indices ignoring text strictly inside quotes
    function findPSCTPunctuation(str, char) {
        let inQuotes = false;
        for (let i = 0; i < str.length; i++) {
            const current = str[i];

            // Detect single or double quotes
            if (current === '"' || current === '“' || current === '”') {
                inQuotes = !inQuotes;
            }
            // Only ignore the character if it is inside quotes
            else if (current === char && !inQuotes) {
                return i;
            }
        }
        return -1;
    }

    // Processes each sentence to strictly follow PSCT syntax
    function formatSentencePSCT(sentence) {
        if (!sentence.trim()) return sentence;

        let result = sentence;
        const colonIndex = findPSCTPunctuation(result, ':');
        const semicolonIndex = findPSCTPunctuation(result, ';');

        // Case 1: Contains both Condition (:) and Cost (;) -> "Condition: Cost; Effect."
        if (colonIndex !== -1 && semicolonIndex !== -1 && colonIndex < semicolonIndex) {
            const conditionPart = result.substring(0, colonIndex + 1);
            const costPart = result.substring(colonIndex + 1, semicolonIndex + 1);
            const effectPart = result.substring(semicolonIndex + 1);

            return `<span style="color: ${PSCT_COLORS.condition}; font-weight: 500;">${escapeHTML(conditionPart)}</span>` +
                   `<span style="color: ${PSCT_COLORS.cost}; font-weight: 500;">${escapeHTML(costPart)}</span>` +
                   escapeHTML(effectPart);
        }

        // Case 2: Contains Condition only (:) -> "Condition: Effect."
        if (colonIndex !== -1) {
            const conditionPart = result.substring(0, colonIndex + 1);
            const effectPart = result.substring(colonIndex + 1);

            return `<span style="color: ${PSCT_COLORS.condition}; font-weight: 500;">${escapeHTML(conditionPart)}</span>` +
                   escapeHTML(effectPart);
        }

        // Case 3: Contains Cost only (;) -> "Cost; Effect."
        if (semicolonIndex !== -1) {
            const costPart = result.substring(0, semicolonIndex + 1);
            const effectPart = result.substring(semicolonIndex + 1);

            return `<span style="color: ${PSCT_COLORS.cost}; font-weight: 500;">${escapeHTML(costPart)}</span>` +
                   escapeHTML(effectPart);
        }

        // Case 4: Effect only (no : or ;)
        return escapeHTML(result);
    }

    function processText(text) {
        if (!text) return text;

        // Process lines while preserving the original card line breaks
        const lines = text.split('\n');
        const processedLines = lines.map(line => formatSentencePSCT(line));

        return processedLines.join('\n');
    }

    function processCardDescription() {
        const cardDescription = document.getElementById('card-description');
        if (!cardDescription) return;

        // Retrieve raw text maintained by DuelingNexus
        const rawText = cardDescription.innerText || cardDescription.textContent;
        if (!rawText) return;

        // Skip if text hasn't changed since last cycle
        if (cardDescription.getAttribute('data-raw-cache') === rawText) return;

        // Cache the raw string
        cardDescription.setAttribute('data-raw-cache', rawText);

        // Render formatted HTML with colors applied
        cardDescription.innerHTML = processText(rawText);
    }

    // ============================================
    // INITIALIZATION
    // ============================================
    function init() {
        setInterval(processCardDescription, 100);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
