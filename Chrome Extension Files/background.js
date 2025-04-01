chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "ai_analysis") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        function: analyzePrivacyPolicy
      });
    });
  } 
});

async function analyzePrivacyPolicy() {
  const apiKey = "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";
  const apiUrl = "https://openrouter.ai/api/v1/chat/completions";
  
  // Extract webpage text
  let bodyText = document.body.innerText.slice(0, 5000); // 

  const requestBody = {
    
  // Available AI models (Uncomment the one you want to use)
    "model": "mistralai/mistral-7b-instruct:free",
    // "model": "google/gemini-pro:free",
    // "model": "anthropic/claude-instant:free",
    // "model": "deepseek-ai/deepseek-llm-67b-chat",
    // "model": "cohere/command-r-plus:free",
    // "model": "meta/llama-3-70b-instruct",
    // "model": "openai/gpt-3.5-turbo-1106",
    // "model": "meta/llama-2-70b-chat",
    // "model": "huggingfaceh4/zephyr-7b-alpha",
    messages: [
      { 
        "role": "system", 
        "content": "Analyze website privacy policies using objective criteria. Identify key terms that indicate strong or weak privacy practices. Adjust the rating based on repeated usage of positive or negative phrases. Format the response exactly as follows:\n\nRating: x/10\n\nGood:\n* [positive aspect]\n* [positive aspect]\n\nBad:\n* [negative aspect]\n* [negative aspect]\n\nSummary:\n[Short reason for score, highlighting main issue].\n\nDo not use first-person language."
      },
      { 
        "role": "user", 
        "content": `Analyze the following privacy policy and provide a rating (1-10) based on privacy protection. Highlight key terms and adjust the score based on repetition.\n\n
        
        **Good Policies**:
        - "End-to-end encryption"
        - "No data sharing with third parties"
        - "Minimal data collection"
        - "User data is anonymized"
        - "Data retention policy: [Short duration]"
        - "Users can request data deletion"
  
        **Bad Policies**:
        - "Data shared with affiliates/partners"
        - "Third-party tracking"
        - "Retains data indefinitely"
        - "May collect browsing history"
        - "Personal data used for targeted ads"
        - "Changes policy without notice"
  
        **Scoring Rules**:
        - Frequent use of **good indicators** increases the score.
        - Frequent use of **bad indicators** decreases the score.
        - If both good and bad terms appear, adjust accordingly.
  
        **Privacy Policy to Analyze**:\n\n${bodyText}`
      }
    ],
  };

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    let aiResponse = data.choices?.[0]?.message?.content || "Could not analyze the privacy policy.";

    // Send response back to popup.js
    chrome.runtime.sendMessage({ result: `Results For Webpage Privacy Rating:\n\n${aiResponse}` });

  } catch (error) {
    console.error("API Error:", error);
    chrome.runtime.sendMessage({ result: "Error: Unable to get a privacy rating." });
  }
}

