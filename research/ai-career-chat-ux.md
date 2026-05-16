# AI Career Coaching & Resume Tailoring UX Report

## Executive Summary
This report analyzes how top AI-powered job platforms (Teal HQ, Jobscan, and ClearATS-like workflows) handle conversational career coaching and resume tailoring. Leap is building a chat experience using Gemini 2.5 Flash via the Vercel AI SDK. To differentiate, Leap must bridge the gap between static form-filling and true, context-aware conversational coaching.

## Conversation Patterns & Data Grounding

### Teal HQ
*   **Conversation Pattern:** Primarily single-shot interactions disguised as chat or "generate" buttons. Users click to "tailor this bullet point," and the AI returns a rewritten string. True multi-turn conversation is limited; the UI is heavily structured around form fields and kanban boards.
*   **Data Grounding:** High. Teal's AI is deeply grounded in the user's structured profile (skills, job history) and the specific job description saved via their Chrome extension. It uses the JD to suggest keyword inclusions.
*   **UX Note:** Teal's primary strength is the *organization* of data (the Kanban tracker), not a conversational interface.

### Jobscan
*   **Conversation Pattern:** "Scanner" UX rather than "Chat" UX. It is a highly transactional, single-shot pattern. The user inputs Resume + JD -> System outputs a "Match Score" with a static list of missing keywords. The "Power Edit" feature acts as an AI text replacement tool, not a coaching conversation.
*   **Data Grounding:** Purely text-to-text comparison (Resume vs. JD). It does not maintain a long-term "Application History" context across different jobs.
*   **UX Note:** Highly analytical and educational about ATS systems, but feels like an audit tool rather than a career coach.

### Emerging Patterns (e.g., JobShinobi / ClearATS style)
*   **Conversation Pattern:** Multi-turn chat agents embedded alongside the resume editor (e.g., chat-based AI agent that edits LaTeX + compiles preview). This allows iterative refinement ("Make this sound more impactful" -> "Now quantify it").
*   **Data Grounding:** Grounded in the current document state and real-time edits, but often struggles to remember previous interactions or high-level career goals.

## Anti-Patterns to Avoid

1.  **The "Blank Canvas" Chatbot:** Dropping the user into an empty chat window saying "How can I help you today?" This causes high cognitive load. The chat should proactively suggest actions based on the user's current state (e.g., "I see you just saved a Senior React role. Want me to draft a summary tailored to it?").
2.  **Amnesia Across Sessions:** If the AI helps tailor a resume for Company A on Tuesday, and the user asks for interview prep for Company A on Thursday, the AI *must* remember the tailored resume and the job description. Losing context frustrates users.
3.  **Generic "Cheerleader" Advice:** Responding to "How do I get this job?" with "Make sure to network and have a clean resume!" Gemini 2.5 Flash is capable of highly specific advice. The AI should say: "Your resume lacks the explicit 'Kubernetes' requirement mentioned in the JD. Let's rewrite your AWS deployment bullet to highlight your container orchestration experience."

## 3 Specific UX Decisions Leap Should Copy

1.  **Side-by-Side Streaming Editing:** Copy the pattern where the chat interface is a sidebar next to the main document/profile view. As Gemini 2.5 Flash streams the response, use the Vercel AI SDK to stream the *suggested edits directly into a preview of the resume*, highlighting the diffs, rather than just outputting text in the chat bubble.
2.  **Context-Aware Quick Prompts:** Use the user's application history to pre-populate chat buttons. If the user moves a job to the "Interview" stage in the tracker, the chat should automatically surface a button: "Generate a mock interview based on this JD and my profile."
3.  **Explainability via Keyword Highlighting:** Like Jobscan, clearly highlight *why* the AI made a change. If the AI rewrites a bullet point, it should annotate the response: "I added 'Agile' and 'Scrum' because they are required in the target JD."

## 3 Specific UX Decisions Leap Should AVOID

1.  **Gating Context Behind Prompts:** Do not make the user paste their resume or the job description into the chat. The system prompt must automatically inject the current active Profile, Resume, and selected Application History in the background. The user should just be able to type "Tailor my resume for this."
2.  **Replacing the User's Voice Completely:** AI often writes in a sterile, corporate tone. Avoid 1-click "Rewrite Everything" buttons that destroy the user's unique phrasing. Instead, use a conversational flow: "Here are 3 ways to rewrite this bullet. Option A is more technical, Option B focuses on leadership. Which do you prefer?"
3.  **Static "Score" Anxiety:** Jobscan induces anxiety by gating "success" behind a 75%+ match score. Leap should avoid a pass/fail UX. Instead of "Your match is 40%, you will fail," the UX should be: "Here are the 3 fastest ways to increase your alignment for this specific role." Frame it as coaching, not grading.
