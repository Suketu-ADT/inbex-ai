/**
 * INBEX — Classifier Service
 * Robust keyword-based email classifier that replaces the Python TF-IDF + SVM model.
 * Uses weighted keyword matching across 5 categories.
 *
 * Returns: { category, confidence, scores }
 */
'use strict';

// Weighted keywords per category (weight = relevance strength)
const CATEGORY_KEYWORDS = {
    HR: {
        keywords: [
            { word: 'leave', weight: 2.5 },
            { word: 'annual leave', weight: 3.0 },
            { word: 'sick leave', weight: 3.0 },
            { word: 'maternity', weight: 2.5 },
            { word: 'hr', weight: 2.0 },
            { word: 'human resources', weight: 3.0 },
            { word: 'salary', weight: 2.5 },
            { word: 'payroll', weight: 2.5 },
            { word: 'onboarding', weight: 2.0 },
            { word: 'resignation', weight: 3.0 },
            { word: 'recruit', weight: 2.0 },
            { word: 'recruitment', weight: 2.5 },
            { word: 'interview', weight: 2.0 },
            { word: 'employee', weight: 1.8 },
            { word: 'appraisal', weight: 2.5 },
            { word: 'performance review', weight: 2.5 },
            { word: 'benefits', weight: 1.5 },
            { word: 'attendance', weight: 2.0 },
            { word: 'absence', weight: 2.5 },
            { word: 'policy', weight: 1.0 },
            { word: 'handbook', weight: 1.5 },
            { word: 'training', weight: 1.5 },
            { word: 'offer letter', weight: 3.0 },
            { word: 'termination', weight: 3.0 },
            { word: 'probation', weight: 2.0 },
        ],
    },
    Finance: {
        keywords: [
            { word: 'invoice', weight: 3.0 },
            { word: 'payment', weight: 2.5 },
            { word: 'finance', weight: 2.0 },
            { word: 'bank', weight: 2.0 },
            { word: 'transaction', weight: 2.5 },
            { word: 'tax', weight: 2.5 },
            { word: 'budget', weight: 2.5 },
            { word: 'expense', weight: 2.5 },
            { word: 'revenue', weight: 2.5 },
            { word: 'accounts payable', weight: 3.0 },
            { word: 'accounts receivable', weight: 3.0 },
            { word: 'reimbursement', weight: 2.5 },
            { word: 'purchase order', weight: 2.5 },
            { word: 'financial', weight: 2.0 },
            { word: 'audit', weight: 2.0 },
            { word: 'quarterly report', weight: 2.5 },
            { word: 'profit', weight: 1.5 },
            { word: 'cost', weight: 1.0 },
            { word: 'due', weight: 1.5 },
            { word: '$', weight: 1.5 },
            { word: 'billing', weight: 2.5 },
            { word: 'credit', weight: 1.5 },
            { word: 'debit', weight: 1.5 },
        ],
    },
    Work: {
        keywords: [
            { word: 'meeting', weight: 2.0 },
            { word: 'project', weight: 2.0 },
            { word: 'deadline', weight: 2.5 },
            { word: 'review', weight: 1.5 },
            { word: 'report', weight: 1.5 },
            { word: 'team', weight: 1.5 },
            { word: 'sprint', weight: 2.5 },
            { word: 'task', weight: 1.5 },
            { word: 'design', weight: 1.5 },
            { word: 'feedback', weight: 1.5 },
            { word: 'milestone', weight: 2.0 },
            { word: 'standup', weight: 2.5 },
            { word: 'roadmap', weight: 2.0 },
            { word: 'stakeholder', weight: 2.0 },
            { word: 'deployment', weight: 2.0 },
            { word: 'release', weight: 1.5 },
            { word: 'code review', weight: 2.5 },
            { word: 'pull request', weight: 2.5 },
            { word: 'jira', weight: 2.0 },
            { word: 'confluence', weight: 2.0 },
            { word: 'figma', weight: 2.0 },
            { word: 'handoff', weight: 2.0 },
            { word: 'agenda', weight: 1.5 },
            { word: 'scope', weight: 1.5 },
            { word: 'blockers', weight: 2.0 },
        ],
    },
    Personal: {
        keywords: [
            { word: 'barbecue', weight: 3.0 },
            { word: 'party', weight: 2.5 },
            { word: 'weekend', weight: 2.0 },
            { word: 'family', weight: 2.0 },
            { word: 'hey', weight: 1.0 },
            { word: 'friend', weight: 2.0 },
            { word: 'invite', weight: 1.5 },
            { word: 'catch up', weight: 2.5 },
            { word: 'birthday', weight: 2.5 },
            { word: 'personal', weight: 1.5 },
            { word: 'vacation', weight: 2.0 },
            { word: 'dinner', weight: 2.0 },
            { word: 'drinks', weight: 2.0 },
            { word: 'game night', weight: 2.5 },
            { word: 'kids', weight: 1.5 },
            { word: 'wedding', weight: 2.5 },
            { word: 'anniversary', weight: 2.5 },
            { word: 'hang out', weight: 2.0 },
            { word: 'road trip', weight: 2.5 },
            { word: 'movie', weight: 1.5 },
            { word: 'recipe', weight: 1.5 },
            { word: 'cheers', weight: 1.0 },
            { word: 'fun', weight: 1.0 },
        ],
    },
    Spam: {
        keywords: [
            // Classic scam
            { word: 'winner', weight: 3.0 },
            { word: 'won', weight: 2.0 },
            { word: 'prize', weight: 3.0 },
            { word: 'lottery', weight: 3.0 },
            { word: 'million', weight: 2.5 },
            { word: 'nigerian', weight: 3.0 },
            { word: 'dear beneficiary', weight: 3.0 },
            { word: 'wire transfer', weight: 2.5 },
            { word: 'once in a lifetime', weight: 3.0 },
            { word: 'congratulations', weight: 1.5 },
            // Urgency/pressure
            { word: 'click here', weight: 2.5 },
            { word: 'act now', weight: 3.0 },
            { word: 'limited time', weight: 2.5 },
            { word: 'offer expires', weight: 2.5 },
            { word: 'no obligation', weight: 2.5 },
            { word: 'risk free', weight: 2.5 },
            { word: 'guaranteed', weight: 1.5 },
            { word: 'claim', weight: 2.0 },
            { word: '!!!', weight: 2.0 },
            // Promotional / marketing
            { word: 'unsubscribe', weight: 2.5 },
            { word: 'opt out', weight: 2.0 },
            { word: 'opt-out', weight: 2.0 },
            { word: 'email preferences', weight: 2.0 },
            { word: 'manage preferences', weight: 2.0 },
            { word: 'promotional', weight: 2.5 },
            { word: 'promotion', weight: 2.0 },
            { word: 'special offer', weight: 2.5 },
            { word: 'exclusive deal', weight: 2.5 },
            { word: 'discount', weight: 2.0 },
            { word: '% off', weight: 2.5 },
            { word: 'coupon', weight: 2.5 },
            { word: 'promo code', weight: 2.5 },
            { word: 'flash sale', weight: 2.5 },
            { word: 'shop now', weight: 2.5 },
            { word: 'buy now', weight: 2.5 },
            { word: 'order now', weight: 2.0 },
            { word: 'deal of the day', weight: 2.5 },
            { word: 'limited offer', weight: 2.5 },
            { word: 'sale ends', weight: 2.0 },
            // Newsletter / bulk
            { word: 'newsletter', weight: 2.0 },
            { word: 'weekly digest', weight: 2.0 },
            { word: 'daily digest', weight: 2.0 },
            { word: 'you are receiving this', weight: 2.5 },
            { word: 'this email was sent to', weight: 2.0 },
            { word: 'view in browser', weight: 2.5 },
            { word: 'view this email', weight: 2.0 },
            { word: 'add us to your', weight: 2.0 },
            { word: 'mailing list', weight: 2.0 },
            // Phishing
            { word: 'verify your account', weight: 2.5 },
            { word: 'confirm your identity', weight: 2.0 },
            { word: 'suspended', weight: 2.0 },
            { word: 'unusual activity', weight: 1.5 },
            { word: 'update your payment', weight: 2.5 },
            { word: 'password expired', weight: 2.0 },
            // Free stuff
            { word: 'free trial', weight: 2.0 },
            { word: 'free gift', weight: 2.5 },
            { word: 'no credit card', weight: 2.0 },
            { word: 'earn money', weight: 2.5 },
            { word: 'make money', weight: 2.5 },
            { word: 'work from home', weight: 2.0 },
        ],
    },
};

// Senders that strongly indicate spam/promotional
const SPAM_SENDER_SIGNALS = [
    'noreply', 'no-reply', 'newsletter', 'promo', 'marketing',
    'deals', 'offers', 'mailer', 'notifications@', 'updates@',
    'info@', 'sales@', 'support@', 'hello@',
];

// Trusted senders that should NOT be classified as spam even if keywords match
const TRUSTED_SENDERS = [
    'google.com', 'microsoft.com', 'apple.com', 'github.com',
    'accounts.google.com', 'linkedin.com', 'amazon.com',
];

const CATEGORIES = ['HR', 'Work', 'Finance', 'Personal', 'Spam'];

/**
 * Classify email text using weighted keyword matching.
 * @param {string} text - The email text to classify
 * @param {string} [sender] - Optional sender email for context
 * @returns {{ category: string, confidence: number, scores: Object<string, number> }}
 */
function classify(text, sender = '') {
    const lower = text.toLowerCase();
    const senderLower = sender.toLowerCase();

    // Calculate raw scores for each category
    const rawScores = {};

    for (const cat of CATEGORIES) {
        let score = 0;
        const { keywords } = CATEGORY_KEYWORDS[cat];

        for (const { word, weight } of keywords) {
            if (lower.includes(word)) {
                // Count occurrences for extra weight
                const regex = new RegExp(escapeRegex(word), 'gi');
                const matches = lower.match(regex);
                const count = matches ? matches.length : 0;
                // Diminishing returns for repeated matches
                score += weight * (1 + Math.log(count));
            }
        }

        rawScores[cat] = score;
    }

    // Sender-based spam boost
    if (senderLower) {
        const isTrusted = TRUSTED_SENDERS.some(ts => senderLower.includes(ts));
        const isSpammySender = SPAM_SENDER_SIGNALS.some(ss => senderLower.includes(ss));

        if (isSpammySender && !isTrusted) {
            rawScores['Spam'] += 3.0;
        }
        if (isTrusted) {
            // Reduce spam score for trusted senders
            rawScores['Spam'] *= 0.3;
            // Boost Work score for trusted senders
            rawScores['Work'] += 1.5;
        }
    }

    // Add tiny random noise for variety (< 0.05)
    for (const cat of CATEGORIES) {
        rawScores[cat] += Math.random() * 0.05;
    }

    // Softmax normalization to get probabilities
    const maxScore = Math.max(...Object.values(rawScores));

    // If all scores are near zero, return a default with low confidence
    if (maxScore < 0.2) {
        const defaultScores = {};
        CATEGORIES.forEach((c) => (defaultScores[c] = 0.2));
        return {
            category: 'Work',
            confidence: 0.2,
            scores: defaultScores,
        };
    }

    const expScores = {};
    let expSum = 0;
    for (const cat of CATEGORIES) {
        expScores[cat] = Math.exp(rawScores[cat] - maxScore);
        expSum += expScores[cat];
    }

    const scores = {};
    for (const cat of CATEGORIES) {
        scores[cat] = parseFloat((expScores[cat] / expSum).toFixed(4));
    }

    // Pick winner
    const category = CATEGORIES.reduce((a, b) =>
        scores[a] > scores[b] ? a : b
    );
    const confidence = parseFloat(scores[category].toFixed(4));

    return { category, confidence, scores };
}

/**
 * Check if classifier is loaded/ready (always true for keyword-based).
 */
function isLoaded() {
    return true;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { classify, isLoaded };
