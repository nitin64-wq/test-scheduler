
// =========================
// Coding Arena Logic
// =========================

let editor; // CodeMirror instance

document.addEventListener("DOMContentLoaded", () => {
    // Other init code...

    // Attach listener to tabs to init editor if needed
    const codingTab = document.querySelector('.nav-link[data-target="coding-section"]');
    if (codingTab) {
        codingTab.addEventListener('click', () => {
            // Init editor if not already done, need slight delay for visibility
            setTimeout(() => {
                if (!editor) {
                    const textArea = document.getElementById("codeEditor");
                    if (textArea) {
                        editor = CodeMirror.fromTextArea(textArea, {
                            mode: "python",
                            theme: "dracula",
                            lineNumbers: true,
                            autoCloseBrackets: true,
                            indentUnit: 4
                        });
                        editor.setSize("100%", "100%");
                    }
                } else {
                    editor.refresh();
                }

                // Load challenges list when tab is opened
                loadCodingChallenges();
            }, 100);
        });
    }
});

let allChallenges = [];

async function loadCodingChallenges() {
    const select = document.getElementById("challengeSelect");
    if (!select) return;

    // Check if already loaded or if fetching
    if (select.options.length > 1) return;

    try {
        const res = await fetch('/api/admin/challenges');
        allChallenges = await res.json();

        allChallenges.forEach(c => {
            const option = document.createElement("option");
            option.value = c.id;
            option.textContent = c.title;
            select.appendChild(option);
        });
    } catch (err) {
        console.error("Failed to load challenges", err);
    }
}

function loadSelectedChallenge() {
    const select = document.getElementById("challengeSelect");
    const descDiv = document.getElementById("problemDescription");
    const id = parseInt(select.value);

    const challenge = allChallenges.find(c => c.id === id);
    if (!challenge) return;

    descDiv.innerHTML = `
        <h4>Problem: ${challenge.title}</h4>
        <p>${challenge.description.replace(/\n/g, '<br>')}</p>
        <div class="test-cases">
          <h5>Example:</h5>
          <p><strong>Input:</strong> ${challenge.example_input || 'N/A'}</p>
          <p><strong>Output:</strong> ${challenge.example_output || 'N/A'}</p>
        </div>
    `;

    if (editor) {
        // Minimal starter generic template
        editor.setValue(`# Write your code here for: ${challenge.title}\n\ndef solve():\n    # Your logic here\n    pass\n\n# Test here\nprint(solve())`);
    }
}


async function runCode() {
    if (!editor) {
        alert("Editor not initialized. Please refresh the page.");
        return;
    }
    const code = editor.getValue();
    const outputEl = document.getElementById("codeOutput");
    const statusEl = document.getElementById("runStatus");

    outputEl.textContent = "Running...";
    statusEl.textContent = "⚙️ Executing...";

    try {
        const res = await fetch('/api/run_code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: code, language: 'python' })
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || `Server Error: ${res.status}`);
        }

        const data = await res.json();
        outputEl.textContent = data.output || "No output returned.";
        statusEl.textContent = "✅ Completed";

    } catch (err) {
        console.error("Run Code Error:", err);
        outputEl.textContent = "Execution Error: " + err.message;
        statusEl.textContent = "❌ Failed";
    }
}

async function submitCode() {
    if (!editor) return;

    const select = document.getElementById("challengeSelect");
    const challengeId = select ? parseInt(select.value) : null;
    if (!challengeId) {
        alert("Please select a challenge first.");
        return;
    }

    const studentData = JSON.parse(localStorage.getItem("studentData"));
    if (!studentData || !studentData.id) {
        alert("Please login first.");
        return;
    }

    const outputEl = document.getElementById("codeOutput");
    outputEl.textContent = "Submitting...";

    try {
        const res = await fetch('/api/coding/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                student_id: studentData.id,
                challenge_id: challengeId,
                code: editor.getValue(),
                status: 'Accepted' // For this demo, we auto-accept. Real app would validate.
            })
        });

        const data = await res.json();
        if (res.ok) {
            outputEl.textContent = data.message;
            await customAlert("Code submitted successfully!");
        } else {
            outputEl.textContent = "Error: " + data.error;
            await customAlert("Submission failed: " + data.error);
        }
    } catch (err) {
        outputEl.textContent = "Network Error: " + err.message;
    }
}
