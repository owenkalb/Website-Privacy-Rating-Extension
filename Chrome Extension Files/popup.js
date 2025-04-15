document.addEventListener("DOMContentLoaded", () => {
  // UI Elements
  const analyzeButton = document.getElementById("analyzeButton");
  const toggleDetailsButton = document.getElementById("toggleDetailsButton");
  const loadingElement = document.getElementById("loading");
  const ratingSummary = document.getElementById("rating-summary");
  const resultContainer = document.getElementById("result-container");
  const statusMessage = document.getElementById("status-message");
  const urlDisplay = document.getElementById("url-display");
  const warningMessage = document.getElementById("warning-message");
  const debugContainer = document.getElementById("debug-container");

  // Rating elements
  const ratingCircle = document.getElementById("rating-circle");
  const ratingValue = document.getElementById("rating-value");
  const goodPractices = document.getElementById("good-practices");
  const badPractices = document.getElementById("bad-practices");

  let detailsVisible = false;
  let currentUrl = "";
  let debugLines = [];

  // Initialize state
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs.length > 0) {
      try {
        currentUrl = new URL(tabs[0].url).hostname;
        urlDisplay.textContent = currentUrl;
        urlDisplay.title = currentUrl;
      } catch (e) {
        urlDisplay.textContent = "unknown";
        addDebugLine("URL parsing error: " + e.message);
      }
    } else {
      urlDisplay.textContent = "No active tab";
      addDebugLine("No active tab found");
    }
  });

  // Add debug info
  function addDebugLine(message) {
    if (!debugContainer) return;

    const timestamp = new Date().toLocaleTimeString();
    debugLines.push(`[${timestamp}] ${message}`);

    // Keep only the last 20 lines
    if (debugLines.length > 20) {
      debugLines.shift();
    }

    debugContainer.innerHTML = debugLines.join('<br>');
    debugContainer.scrollTop = debugContainer.scrollHeight;
  }

  // Button event listeners
  analyzeButton.addEventListener("click", () => {
    startAnalysis();
  });

  toggleDetailsButton.addEventListener("click", () => {
    toggleDetails();
  });

  // Start analysis process
  function startAnalysis() {
    // Reset UI
    analyzeButton.disabled = true;
    toggleDetailsButton.disabled = true;
    detailsVisible = false;
    resultContainer.style.display = "none";
    ratingSummary.style.display = "none";
    warningMessage.style.display = "none";

    // Show loading state
    analyzeButton.textContent = "Analyzing...";
    loadingElement.style.display = "block";
    statusMessage.textContent = "Processing...";

    addDebugLine("Analysis requested for: " + currentUrl);

    // Set a UI timeout in case background script doesn't respond
    const uiTimeout = setTimeout(() => {
      addDebugLine("WARNING: No response after 60 seconds");
      statusMessage.textContent = "Analysis taking longer than expected...";
    }, 60000);

    // Request analysis
    try {
      chrome.runtime.sendMessage({ action: "ai_analysis" });
      addDebugLine("Analysis request sent to background script");
    } catch (e) {
      addDebugLine("ERROR: Failed to send analysis request: " + e.message);
      statusMessage.textContent = "Failed to start analysis";
      analyzeButton.disabled = false;
      analyzeButton.textContent = "Try Again";
      loadingElement.style.display = "none";
      clearTimeout(uiTimeout);
    }
  }

  // Toggle details visibility
  function toggleDetails() {
    detailsVisible = !detailsVisible;
    resultContainer.style.display = detailsVisible ? "block" : "none";
    toggleDetailsButton.textContent = detailsVisible ? "Hide Details" : "Show Details";
  }

  // Process and display rating
  function displayRating(data) {
    // Hide loading
    loadingElement.style.display = "none";

    // Display URL
    urlDisplay.textContent = data.url || currentUrl;
    urlDisplay.title = data.url || currentUrl;

    // Reset button state
    analyzeButton.disabled = false;
    analyzeButton.textContent = "Analyze Again";

    // Handle errors
    if (data.error) {
      addDebugLine("ERROR: " + data.error);
      statusMessage.textContent = "Analysis failed";
      warningMessage.textContent = data.error;
      warningMessage.style.display = "block";
      return;
    }

    // Display results
    ratingSummary.style.display = "block";
    toggleDetailsButton.disabled = false;

    // Set status message
    if (data.fromCache) {
      const date = new Date(data.timestamp);
      statusMessage.textContent = `Cached result from ${date.toLocaleDateString()}`;
      addDebugLine("Using cached result from: " + date.toLocaleString());
    } else {
      statusMessage.textContent = "Analysis complete";
      addDebugLine("Fresh analysis completed");
    }

    // Show warning if not on a policy page
    if (data.isPolicyPage === false) {
      warningMessage.textContent = "This doesn't appear to be a privacy policy page. Results may be incomplete.";
      warningMessage.style.display = "block";
      addDebugLine("Warning: Not a privacy policy page");
    }

    // Process rating
    const rating = data.rating !== null ? data.rating : 5;
    addDebugLine("Privacy rating: " + rating + "/10");

    // Set rating circle color
    ratingValue.textContent = rating;
    if (rating >= 8) {
      ratingCircle.style.backgroundColor = "#28a745"; // Good (green)
    } else if (rating >= 6) {
      ratingCircle.style.backgroundColor = "#ffc107"; // Medium (yellow)
    } else if (rating >= 4) {
      ratingCircle.style.backgroundColor = "#fd7e14"; // Poor (orange)
    } else {
      ratingCircle.style.backgroundColor = "#dc3545"; // Bad (red)
    }

    // Process full result
    resultContainer.innerHTML = formatResult(data.result);

    // Extract and display key points
    const goodPoints = extractPoints(data.result, "Good:");
    const badPoints = extractPoints(data.result, "Bad:");

    goodPractices.innerHTML = goodPoints.length > 0
      ? `<strong>✓ Good:</strong> ${goodPoints[0]}`
      : "";

    badPractices.innerHTML = badPoints.length > 0
      ? `<strong>✗ Bad:</strong> ${badPoints[0]}`
      : "";

    addDebugLine("UI updated with analysis results");
  }

  // Helper to extract bullet points from AI result
  function extractPoints(text, sectionName) {
    const pattern = new RegExp(`${sectionName}\\s*([\\s\\S]*?)(?=Summary:|Recommendations:|$)`, "i");
    const match = text.match(pattern);

    if (!match || !match[1]) return [];

    // Extract bullet points
    const bulletPoints = match[1].split(/\*\s+/).filter(line =>
      line.trim().length > 0 && !line.trim().match(/^[\s\r\n]*$/)
    );

    return bulletPoints;
  }

  // Format the result with proper HTML
  function formatResult(text) {
    if (!text) return "<p>No analysis available</p>";

    // Replace section headers with styled headers
    text = text.replace(/Rating:\s*(\d+(\.\d+)?)\s*\/\s*10/i, '<div class="section-title">Rating: $1/10</div>');
    text = text.replace(/Good:/g, '<div class="section-title good">Good:</div>');
    text = text.replace(/Bad:/g, '<div class="section-title bad">Bad:</div>');
    text = text.replace(/Summary:/g, '<div class="section-title">Summary:</div>');
    text = text.replace(/Recommendations:/g, '<div class="section-title">Recommendations:</div>');

    // Format bullet points
    const lines = text.split('\n');
    let inList = false;

    for (let i = 0; i < lines.length; i++) {
      // Check if line is a bullet point
      if (lines[i].trim().startsWith('*')) {
        // Start a list if not already in one
        if (!inList) {
          lines[i] = '<ul>' + lines[i];
          inList = true;
        }

        // Format the bullet point
        lines[i] = lines[i].replace(/\*\s+(.+)/, '<li>$1</li>');
      }
      // End the list if we've moved past bullet points
      else if (inList) {
        lines[i-1] += '</ul>';
        inList = false;
      }
    }

    // Close any open list at the end
    if (inList) {
      lines.push('</ul>');
    }

    // Join lines and wrap paragraphs
    return lines.join('\n')
      .replace(/\n\n+/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/<p><div/g, '<div')
      .replace(/<\/div><\/p>/g, '</div>')
      .replace(/^(.+)$/, '<p>$1</p>');
  }

  // Listen for analysis results
  chrome.runtime.onMessage.addListener((message) => {
    if (message.debug) {
      // Debug message from background script
      addDebugLine(`BG: ${message.message} ${message.data || ''}`);
    } else if (message.status === "analyzing") {
      // Update UI for analysis in progress
      statusMessage.textContent = "AI analysis in progress...";
      addDebugLine(`Analysis started, content length: ${message.contentLength || 'unknown'} chars`);
    } else if (message.result || message.error) {
      // Display results
      addDebugLine("Analysis results received");
      displayRating(message);
    }
  });

  // Add initial debug line
  addDebugLine("Extension popup initialized");
});