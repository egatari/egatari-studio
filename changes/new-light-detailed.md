### Changed

- Editor, New… step 4: the question no longer asks for the chat AI's plan (free or paid); it asks **Choose the instructions for the AI**
  (AI に渡す指示を選んでください): **Light (any AI)**, marked “If unsure” (the default), or **Detailed (for paid AI plans)**, each with a
  line saying what it is (owner's decision, 2026-11-07). The line “Egatari is free. This asks about your chat AI's plan.” is gone
- The answered line, the shortening notice and the size hint name the instructions (“Instructions: Light · 15 parts · copied”, “To fit the
  light instructions, …”); the attach-as-a-file line reads “Gemini may cut a copy-and-paste at about 30,000 characters”. The internal names
  (`plan: free | paid`, `--plan`, `studio.newDeck.plan`) and the instructions themselves are byte for byte unchanged
- Glossary: light instructions (軽量の指示) and detailed instructions (詳細の指示) replace free plan and paid plan; 無料のプラン, 有料のプラン
  and 無制限 (the detailed instructions have a 150 KB cap) are avoid words. README, the editor docs, the AI-instruction docs' preamble and size
  table, the make skill and `node kit/llm-pack.mjs --help` use the new words
