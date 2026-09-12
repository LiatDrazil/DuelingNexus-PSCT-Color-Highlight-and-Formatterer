// ==UserScript==
// @name         DuelingNexus - PSCT Color Highlighter & Formatter
// @namespace    https://github.com/LiatDrazil
// @version      1.9.10
// @description  Highlights PSCT conditions/costs and automatically formats card text spacing
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

    // Color theme definition for PSCT syntax highlighting
    const PSCT_COLORS = {
        condition: '#F1FA8C', // Soft Pastel Yellow (Condition before ":")
        cost: '#FF79C6'       // Soft Pastel Pink/Magenta (Cost before ";")
    };

    /**
     * Sanitizes raw string characters to prevent unsafe HTML injection
     * when assigning output to innerHTML.
     */
    function escapeHTML(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    /**
     * Finds the index of a PSCT punctuation mark (':' or ';') within a string.
     * Ignore marks contained within quote marks (e.g., card names like "Elemental HERO: Neos").
     * Single quotes/apostrophes (e.g. "opponent's") are excluded from quote toggling.
     */
    function findPSCTPunctuation(str, char) {
        let inQuotes = false;

        for (let i = 0; i < str.length; i++) {
            const current = str[i];
            
            // Toggle quote state only on double/curly quotes
            if (current === '"' || current === '“' || current === '”') {
                inQuotes = !inQuotes;
            } else if (current === char && !inQuotes) {
                return i; // Found valid PSCT separator outside of quotes
            }
        }
        return -1;
    }

    /**
     * Wraps conditions (before ':') and costs (before ';') in custom-colored HTML <span> tags.
     * Evaluates order when both colon and semicolon exist in a single sentence block.
     */
    function highlightPSCTInBlock(text) {
        if (!text || !text.trim()) return text;

        const colonIndex = findPSCTPunctuation(text, ':');
        const semicolonIndex = findPSCTPunctuation(text, ';');

        // Case 1: Both Condition (:) and Cost (;) are present
        if (colonIndex !== -1 && semicolonIndex !== -1 && colonIndex < semicolonIndex) {
            const conditionPart = text.substring(0, colonIndex + 1);
            const costPart = text.substring(colonIndex + 1, semicolonIndex + 1);
            const effectPart = text.substring(semicolonIndex + 1);

            return `<span style="color: ${PSCT_COLORS.condition}; font-weight: 500;">${escapeHTML(conditionPart)}</span>` +
                   `<span style="color: ${PSCT_COLORS.cost}; font-weight: 500;">${escapeHTML(costPart)}</span>` +
                   escapeHTML(effectPart);
        } 
        // Case 2: Only Condition (:) is present
        else if (colonIndex !== -1) {
            const conditionPart = text.substring(0, colonIndex + 1);
            const effectPart = text.substring(colonIndex + 1);

            return `<span style="color: ${PSCT_COLORS.condition}; font-weight: 500;">${escapeHTML(conditionPart)}</span>` +
                   escapeHTML(effectPart);
        } 
        // Case 3: Only Cost (;) is present
        else if (semicolonIndex !== -1) {
            const costPart = text.substring(0, semicolonIndex + 1);
            const effectPart = text.substring(semicolonIndex + 1);

            return `<span style="color: ${PSCT_COLORS.cost}; font-weight: 500;">${escapeHTML(costPart)}</span>` +
                   escapeHTML(effectPart);
        }

        // Case 4: Plain effect sentence with no PSCT markers
        return escapeHTML(text);
    }

    /**
     * Splits raw text into sentence blocks based on periods, handling parenthetical rules:
     * - Keeps parenthetical rules (e.g., "(This is treated as an Xyz Summon.)") attached to their parent effect.
     * - Splits immediately if the following tag is "(Quick Effect)".
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
                
                // If a period triggered a deferred split for a trailing parenthesis note, break now
                if (parenDepth === 0 && waitingToBreakAfterParen) {
                    sentences.push(current);
                    current = "";
                    waitingToBreakAfterParen = false;
                }
            } else if (char === '.' && !inQuotes && parenDepth === 0) {
                let rest = text.substring(i + 1).trimStart();
                
                // Exception: "(Quick Effect)" belongs to the next sentence block
                if (rest.startsWith('(Quick Effect)')) {
                    sentences.push(current);
                    current = "";
                    continue;
                }

                // If followed by an explanatory note in parentheses, wait for closing paren before splitting
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
     * Orchestrates text cleaning, sentence splitting, PSCT highlighting,
     * and spacing layout using <br><br> tags between distinct effects.
     */
    function processText(text) {
        if (!text) return text;

        // Replace non-breaking spaces (\u00A0) from web elements with standard spaces
        let cleaned = text.replace(/\u00A0/g, ' ');
        const lines = cleaned.split('\n');

        const formattedBlocks = lines.map(line => {
            if (!line.trim()) return '';
            const sentences = splitIntoSentences(line);
            return sentences
                .map(sentence => highlightPSCTInBlock(sentence))
                .filter(s => s && s.length > 0)
                .join('<br><br>'); // Insert double line breaks between effect sentences
        });

        return formattedBlocks.filter(b => b.length > 0).join('<br><br>');
    }

    let isProcessing = false;

    /**
     * Reads text from candidate card containers, formats it, and injects updated HTML.
     */
    function processCardDescription(cardDescription) {
        const rawText = cardDescription.innerText;
        if (!rawText) return;

        const normalizedText = rawText.replace(/\r/g, '').trim();

        // Prevent infinitely re-processing identical text or triggering loop flags
        if (cardDescription.getAttribute('data-psct-cache') === normalizedText) return;

        cardDescription.setAttribute('data-psct-cache', normalizedText);

        isProcessing = true;
        cardDescription.innerHTML = processText(normalizedText);
        isProcessing = false;
    }

    /**
     * Scans the document for any active card description container across different game modes.
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
     * Observes global DOM mutations to capture card description panels in active duels.
     */
    function setupGlobalObserver() {
        const observer = new MutationObserver(() => {
            if (isProcessing) return;
            findAndProcessContainers();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });

        findAndProcessContainers();
    }

    // Initialize execution when the page DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupGlobalObserver);
    } else {
        setupGlobalObserver();
    }
})();
