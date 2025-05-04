// Constants
const API_KEY = "<your api key here>";
const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_CHARS = 4000;
const STORAGE_KEY = "privacyRatings";
const API_TIMEOUT = 30000;

// Debug helper
function debugLog(message, data) {
  console.log(`[Privacy Rater Debug] ${message}`, data || '');
  try {
    chrome.runtime.sendMessage({
      debug: true,
      message: message,
      data: data ? JSON.stringify(data).substring(0, 100) + '...' : ''
    });
  } catch (e) {
    // Ignoring errors when popup is closed
  }
}

// Message listeners
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "ai_analysis") {
    debugLog("Analysis requested");

    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (!tabs || tabs.length === 0) {
        debugLog("No active tab found");
        chrome.runtime.sendMessage({
          error: "No active tab found. Please try again.",
        });
        return;
      }

      debugLog("Active tab", tabs[0].url);
      const currentUrl = new URL(tabs[0].url).hostname;

      // checking if we have a cached rating
      try {
        const cachedRating = await getCachedRating(currentUrl);
        if (cachedRating) {
          debugLog("Using cached result");
          chrome.runtime.sendMessage({
            result: cachedRating.result,
            url: currentUrl,
            timestamp: cachedRating.timestamp,
            fromCache: true
          });
          return;
        }
      } catch (e) {
        debugLog("Cache error", e);
      }

      // Execute the content script directly
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: extractPageContent,
      }, async (results) => {
        if (!results || results.length === 0 || chrome.runtime.lastError) {
          debugLog("Script execution error", chrome.runtime.lastError);
          chrome.runtime.sendMessage({
            error: "Failed to analyze page: " + (chrome.runtime.lastError ? chrome.runtime.lastError.message : "Unknown error"),
            url: currentUrl
          });
          return;
        }

        try {
          const pageContent = results[0].result;
          debugLog(`Extracted content length: ${pageContent.content.length} characters, isPolicyPage: ${pageContent.isPolicyPage}`);

          // Notify popup that analysis has started
          chrome.runtime.sendMessage({
            status: "analyzing",
            contentLength: pageContent.content.length
          });

          // Call API to analyze the content
          const analysisResult = await analyzeContent(pageContent.content, pageContent.isPolicyPage, currentUrl);

          // Send results back to popup
          chrome.runtime.sendMessage(analysisResult);

        } catch (error) {
          debugLog("Analysis error", error);
          chrome.runtime.sendMessage({
            error: "Error analyzing privacy policy: " + error.message,
            url: currentUrl
          });
        }
      });
    });
  } else if (message.action === "clear_cache") {
    clearRatingCache();
    sendResponse({success: true});
  }
  return true; // Keep the message channel open for async responses
});

// Extract content from the page
function extractPageContent() {
  console.log("[Privacy Rater] Extracting page content");

  // Helper function to find privacy policy content on the page
  function findPrivacyPolicyContent() {
    console.log("[Privacy Rater] Looking for privacy policy content");

    // Define patterns that often indicate privacy policy content
    const policyKeywords = [
      'privacy policy', 'privacy statement', 'privacy notice',
      'data policy', 'data protection', 'personal data',
      'information collection', 'personal information'
    ];

    // Define potential containers for privacy policy
    const policyContainers = [
      'main', 'article', '.content', '#content', '.main', '#main',
      '.privacy-policy', '#privacy-policy', '[role="main"]'
    ];

    // Try to find the policy container
    let policyContent = '';

    // First, check if we're already on a privacy policy page (check title and URL)
    const title = document.title.toLowerCase();
    const url = window.location.href.toLowerCase();
    const isPolicyPage = policyKeywords.some(kw =>
      title.includes(kw) || url.includes(kw.replace(/\s+/g, '')) || url.includes(kw.replace(/\s+/g, '-'))
    );

    console.log(`[Privacy Rater] Page title: "${title}", URL contains policy keywords: ${isPolicyPage}`);

    // If it looks like a policy page, try to get content from main containers
    if (isPolicyPage) {
      for (const selector of policyContainers) {
        const container = document.querySelector(selector);
        if (container) {
          policyContent = container.innerText;
          console.log(`[Privacy Rater] Found content in container: ${selector}, length: ${policyContent.length}`);
          break;
        }
      }
    }

    // If still no content, look for sections that might contain policy info
    if (!policyContent) {
      console.log("[Privacy Rater] Looking for privacy-related headings");
      let headingsFound = 0;

      document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
        const headingText = heading.innerText.toLowerCase();
        if (policyKeywords.some(kw => headingText.includes(kw))) {
          // Found a heading related to privacy, get the text from here until the next heading
          headingsFound++;
          let content = '';
          let element = heading.nextElementSibling;

          while (element && !['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(element.tagName)) {
            content += element.innerText + '\n';
            element = element.nextElementSibling;
          }

          console.log(`[Privacy Rater] Found privacy heading: "${headingText}", content length: ${content.length}`);
          policyContent += content;
        }
      });

      console.log(`[Privacy Rater] Found ${headingsFound} privacy-related headings`);
    }

    // If still no content, fall back to body text
    if (!policyContent) {
      console.log("[Privacy Rater] No specific privacy content found, will use general page content");
      return ''; // Signal that we couldn't find specific policy content
    }

    return policyContent;
  }

  // First, try to find privacy policy specific content
  let policyText = findPrivacyPolicyContent();
  let isPolicyPage = policyText.length > 500;

  // If couldn't find specific policy content, use general page content
  if (!isPolicyPage) {
    policyText = document.body.innerText.slice(0, 4000); // Limit to 4000 chars
    console.log(`[Privacy Rater] Using general page content: ${policyText.length} characters`);
  }

  // Return the extracted content
  return {
    content: policyText,
    isPolicyPage: isPolicyPage,
    url: window.location.href,
    title: document.title
  };
}

// Function to analyze content using OpenRouter
async function analyzeContent(text, isPolicyPage, hostname) {
  debugLog(`Preparing API request, text length: ${text.length}`);

  try {
    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("API request timed out after 30 seconds")), API_TIMEOUT);
    });

    // Race the API call against the timeout
    const result = await Promise.race([
      getAIAnalysis(text, isPolicyPage, hostname),
      timeoutPromise
    ]);

    debugLog("API response received");

    // Parse the rating from the result
    const ratingMatch = result.match(/Rating:\s*(\d+(\.\d+)?)\s*\/\s*10/i);
    const numericRating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

    debugLog(`Parsed rating: ${numericRating}`);

    // Store the result in cache
    if (numericRating !== null) {
      await storeRating(hostname, {
        result: result,
        rating: numericRating,
        timestamp: Date.now(),
        isPolicyPage: isPolicyPage
      });
    }

    // Return results to be sent to popup
    return {
      result: result,
      rating: numericRating,
      url: hostname,
      timestamp: Date.now(),
      isPolicyPage: isPolicyPage
    };

  } catch (error) {
    debugLog("Analysis Error", error);
    throw error;
  }
}

// Function to get AI analysis using OpenRouter
async function getAIAnalysis(text, isPolicyPage, hostname) {
  debugLog(`Preparing API request for ${hostname}`);

  // Create appropriate prompt based on whether we found specific policy content
  const contextPrompt = isPolicyPage
    ? `Analyze the following privacy policy from ${hostname}:`
    : `Extract and analyze privacy practices from this webpage content from ${hostname}. This may not be a dedicated privacy policy page, so focus on identifying any statements about data collection, user privacy, cookies, tracking, etc.:`;

  const requestBody = {
    model: "mistralai/mistral-7b-instruct:free",
    messages: [
      {
        "role": "system",
        "content": `You are a privacy policy analyst. Your task is to rate a website's privacy practices objectively and critically, based on the content provided. Use the following scoring rubric:

**Scoring Rules**:
- Start at 10/10
- Subtract points for poor privacy practices:
  - Data sharing with third parties (-1 to -3 depending on extent)
  - Extensive tracking (-1 to -2)
  - Vague language about data usage (-1)
  - Selling personal data (-3)
  - No opt-out options (-1)
  - Retaining data for excessive periods (-1)
  - Collecting sensitive data without clear justification (-2)
  - No transparency about data breaches (-1)
  - Poor data security practices (-2)

- Add points for good practices:
  - Clear opt-out mechanisms (+1)
  - Minimal data collection (+2)
  - Strong encryption/security (+1)
  - No third-party sharing (+2)
  - Short retention periods (+1)
  - Easy data deletion process (+1)
  - Clear explanations of data usage (+1)
  - Privacy-by-design approach (+1)

Format your response as follows:

Rating: x/10

Good:
* [positive aspect]
* [positive aspect]
* [other positive aspects]

Bad:
* [negative aspect]
* [negative aspect]
* [other negative aspects]

Summary:
[Short summary explaining the score. Be objective, concise, and avoid first-person language.]

Recommendations:
[2-3 specific recommendations for users regarding their privacy when using this website]

If you cannot find sufficient information about privacy practices, indicate this in your summary and provide a provisional rating based on what you can infer from available information.`
      },
      {
        "role": "user",
        "content": `${contextPrompt}\n\n${text}`
      }
    ],
    temperature: 0.7,
    max_tokens: 800
  };

  debugLog("Sending API request to OpenRouter");

  const startTime = Date.now();
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody),
  });

  const responseTime = Date.now() - startTime;
  debugLog(`API response received in ${responseTime}ms, status: ${response.status}`);

  if (!response.ok) {
    const errorData = await response.text();
    debugLog(`API Error: ${response.status}`, errorData);
    throw new Error(`API Error (${response.status}): ${errorData}`);
  }

  const data = await response.json();
  debugLog("API JSON parsed");
  const aiResponse = data.choices?.[0]?.message?.content || "Could not analyze the privacy policy.";

  return aiResponse;
}

// Cache functions
async function getCachedRating(url) {
  debugLog(`Checking cache for ${url}`);
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const ratings = data[STORAGE_KEY] || {};

  if (ratings[url] && (Date.now() - ratings[url].timestamp < 86400000)) { // 24h cache
    debugLog(`Cache hit for ${url}`);
    return ratings[url];
  }
  debugLog(`No cache entry for ${url}`);
  return null;
}

async function storeRating(url, ratingData) {
  debugLog(`Storing rating for ${url}`);
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const ratings = data[STORAGE_KEY] || {};

  ratings[url] = ratingData;

  // Limit cache size to 50 entries
  const urls = Object.keys(ratings);
  if (urls.length > 50) {
    const oldestUrl = urls.reduce((oldest, url) => {
      return ratings[url].timestamp < ratings[oldest].timestamp ? url : oldest;
    }, urls[0]);
    debugLog(`Removing oldest cache entry: ${oldestUrl}`);
    delete ratings[oldestUrl];
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: ratings });
  debugLog(`Cache updated, total entries: ${Object.keys(ratings).length}`);
  return true;
}

async function clearRatingCache() {
  debugLog("Clearing rating cache");
  return chrome.storage.local.remove(STORAGE_KEY);
}
