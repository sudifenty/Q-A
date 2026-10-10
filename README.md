# Daily Science — guided revision prototype

A mobile-friendly learner app prototype built from the uploaded question-and-answer guide.

## Learner flow

- One question is shown at a time, with its answer guide directly underneath.
- The learner taps **Mark studied & continue** after reviewing the Q&A.
- The prototype target is **20 questions per set**. Progress is counted once per question.
- The next set is held until the active set is complete; after completion it opens on the next calendar day.
- When the student reaches the end of the question bank, the app pauses and asks the admin to add more material. It does not silently repeat questions.
- The learner does not type answers and the app does not grade responses.

## Question bank

`question_bank.json` is a normalized copy of the provided guide. It has 160 numbered Q&A records with stable IDs, grade, subject, topic, question, and answer fields. Although the filename mentions P4–P6, the attached content is labeled Primary 4 throughout. Its topics are Plant Life, Growing Crops, Weather Changes Around Us, and Personal Hygiene.

## Preview

Open `index.html` in a browser. The interactive preview stores progress in browser local storage where available. Use **Reset preview progress** in the footer to restart the local demo.

## Admin integration still needed

This prototype is not yet connected to the existing admin application. To wire it to real student accounts and admin controls, provide the admin app source/repository or API documentation (please redact secrets). The integration needs to know how the admin exposes:

1. the authenticated student's ID and sign-in/session;
2. the student's active/paused state and daily question target;
3. the question IDs assigned to each daily set;
4. where the learner app should report each question as studied and the full-set completion event; and
5. how the admin should be notified when the question bank is exhausted.

The prototype currently uses a local demo target of 20 and local browser progress. Those will be replaced with the admin's assignment and progress APIs once their contract is available.
