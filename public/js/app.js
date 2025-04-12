// DOM Elements
const youtubeUrlInput = document.getElementById('youtube-url');
const processVideoBtn = document.getElementById('process-video-btn');
const videoInfoEl = document.getElementById('video-info');
const videoThumbnailEl = document.getElementById('video-thumbnail');
const videoTitleEl = document.getElementById('video-title');
const processingStatusEl = document.getElementById('processing-status');
const framesGalleryEl = document.getElementById('frames-gallery');
const framesContainerEl = document.getElementById('frames-container');
const chatContainerEl = document.getElementById('chat-container');
const chatMessagesEl = document.getElementById('chat-messages');
const questionInputEl = document.getElementById('question-input');
const sendQuestionBtn = document.getElementById('send-question-btn');
const loadingEl = document.getElementById('loading');
// Modal elements
const videoModal = document.getElementById('video-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const youtubePlayer = document.getElementById('youtube-player');

// State
let currentVideoId = null;
let currentYoutubeVideoId = null; // Store the original YouTube video ID for the player
let videoHasFrames = false;

// API URL - use the same port as the server
const API_URL = 'http://localhost:8000/api';

// Event Listeners
processVideoBtn.addEventListener('click', processVideo);
sendQuestionBtn.addEventListener('click', sendQuestion);
questionInputEl.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendQuestion();
  }
});
// Modal close listeners
closeModalBtn.addEventListener('click', closeVideoPopup);
videoModal.addEventListener('click', (e) => {
  // Close if clicked outside the modal content
  if (e.target === videoModal) {
    closeVideoPopup();
  }
});
// Add event listener for clickable timestamps (delegated from chatMessagesEl)
chatMessagesEl.addEventListener('click', (e) => {
  if (e.target && e.target.classList.contains('clickable-timestamp')) {
    const time = e.target.dataset.time;
    if (time && currentYoutubeVideoId) {
      showVideoPopup(parseFloat(time));
    }
  }
});

// Functions
async function processVideo() {
  const youtubeUrl = youtubeUrlInput.value.trim();
  
  if (!youtubeUrl) {
    alert('Please enter a YouTube URL');
    return;
  }
  
  // Show loading state
  showLoading(true);
  resetUI(); // Reset UI elements for new video
  
  try {
    // Extract YT video ID and store it for the player
    currentYoutubeVideoId = extractYoutubeVideoId(youtubeUrl);
    
    if (currentYoutubeVideoId) {
      videoThumbnailEl.style.backgroundImage = `url(https://img.youtube.com/vi/${currentYoutubeVideoId}/mqdefault.jpg)`;
      videoInfoEl.style.display = 'flex';
      processingStatusEl.textContent = 'Processing video transcript and extracting frames...';
      videoTitleEl.textContent = 'YouTube Video'; // Placeholder title
    } else {
      console.warn("Could not extract YouTube video ID for thumbnail/player.");
    }
    
    // Send request to backend
    const response = await fetch(`${API_URL}/videos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ youtube_url: youtubeUrl }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to process video');
    }
    
    const data = await response.json();
    currentVideoId = data.video_id;
    videoHasFrames = data.has_frames;
    
    console.log("Video processed with data:", {
      videoId: currentVideoId,
      hasFrames: videoHasFrames,
      frameCount: data.frame_count
    });
    
    // Update UI
    processingStatusEl.textContent = 'Video processed successfully';
    processingStatusEl.style.color = '#4CAF50';
    
    // If we have frames, display them
    if (videoHasFrames) {
      console.log("Video has frames, displaying them");
      await displayVideoFrames(currentVideoId);
      framesGalleryEl.style.display = 'block';
    } else {
      console.log("Video does not have frames");
      framesGalleryEl.style.display = 'none';
    }
    
    // Show chat container
    chatContainerEl.style.display = 'block';
    
    // Add welcome message with appropriate information
    if (videoHasFrames) {
      addMessage('assistant', 'Video processed successfully with visual analysis. Ask me any questions about the video content, and I\'ll analyze both the visuals and audio!');
    } else {
      addMessage('assistant', 'Video processed successfully with transcript analysis. Ask me any questions about the video content!');
    }
    
    // Focus on question input
    questionInputEl.focus();
    
  } catch (error) {
    console.error('Error processing video:', error);
    alert(`Error: ${error.message}`);
    processingStatusEl.textContent = `Error: ${error.message}`;
    processingStatusEl.style.color = '#F44336';
  } finally {
    showLoading(false);
  }
}

async function displayVideoFrames(videoId) {
  try {
    console.log(`Fetching frames for video ID: ${videoId}`);
    
    // Clear existing frames
    framesContainerEl.innerHTML = '';
    
    // Get frames from the backend
    const response = await fetch(`${API_URL}/videos/${videoId}/frames`);
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error(`Failed to fetch frames: ${errorData.error || 'Unknown error'}`);
      throw new Error('Failed to fetch video frames');
    }
    
    const data = await response.json();
    // Ensure 'frames' is an array of objects with a 'url' property
    const frames = data.frames || []; 
    
    console.log(`Received ${frames.length} frames from server:`, frames.slice(0, 2));
    
    if (!Array.isArray(frames) || frames.length === 0 || !frames[0].url) {
      console.log("No valid frame data received (expected array of {url, timestamp}), hiding frames gallery");
      framesGalleryEl.style.display = 'none';
      videoHasFrames = false;
      return;
    }
    
    // Create frame elements, accessing frame.url
    frames.forEach((frame, index) => { // frame is now an object {url, timestamp}
      const frameEl = document.createElement('div');
      frameEl.classList.add('frame');
      // Use frame.url for the background image
      frameEl.style.backgroundImage = `url(${frame.url})`; 
      frameEl.title = `Frame ${index + 1} at ~${frame.timestamp.toFixed(1)}s`; // Add tooltip with timestamp
      
      console.log(`Creating frame element ${index+1} with URL: ${frame.url} (Timestamp: ${frame.timestamp})`);
      
      // Add click event to view larger frame (use frame.url)
      frameEl.addEventListener('click', () => {
        window.open(frame.url, '_blank');
      });
      
      framesContainerEl.appendChild(frameEl);
    });
    
    // Make sure gallery is visible if frames were added
    framesGalleryEl.style.display = 'block'; 
    videoHasFrames = true;
    console.log(`Successfully displayed ${frames.length} frames`);
    
  } catch (error) {
    console.error('Error displaying frames:', error);
    framesGalleryEl.style.display = 'none';
    videoHasFrames = false;
  }
}

async function sendQuestion() {
  const question = questionInputEl.value.trim();
  
  if (!question) {
    alert('Please enter a question');
    return;
  }
  
  // Add user message to chat
  addMessage('user', question);
  
  // Clear input
  questionInputEl.value = '';
  
  // Show loading
  showLoading(true);
  
  try {
    // Send request to backend
    const response = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        question: question,
        video_id: currentVideoId
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get answer');
    }
    
    const data = await response.json();
    
    // Add assistant message to chat including analysis type info
    let messageText = data.answer;
    
    // Include a note about the analysis type
    if (data.analysis_type) {
      const isVisual = data.analysis_type === 'visual_and_transcript';
      const analysisNote = `\n\n[Used ${isVisual ? 'visual and transcript' : 'transcript only'} analysis]`;
      messageText += analysisNote;
    }
    
    addMessage('assistant', messageText);
    
  } catch (error) {
    console.error('Error getting answer:', error);
    addMessage('assistant', `Error: ${error.message}`);
  } finally {
    showLoading(false);
  }
}

function addMessage(sender, content) {
  const messageEl = document.createElement('div');
  messageEl.classList.add('message', sender);
  
  const contentEl = document.createElement('div');
  contentEl.classList.add('message-content');
  
  // Process content for clickable timestamps if it's from the assistant
  if (sender === 'assistant') {
      contentEl.innerHTML = processTimestamps(content);
  } else {
      contentEl.textContent = content;
  }
  
  messageEl.appendChild(contentEl);
  chatMessagesEl.appendChild(messageEl);
  
  // Scroll to bottom
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

/**
 * Finds timestamp patterns in text and replaces them with clickable spans.
 * Handles formats like: "around 5.00s", "at 1:30s", "~15s", "(45.2s)", "[1:10s - 1:15s]"
 * @param {string} text 
 * @returns {string} HTML string with clickable timestamps
 */
function processTimestamps(text) {
    // Regex revised to be more robust for various formats:
    // - Optional non-capturing group for prefixes like (, [, ~, around, at, approx
    // - Optional whitespace
    // - Capture Group 1: The core time value (M:SS or S.SS or S)
    // - Optional whitespace + 's' + optional closing ), ], or boundary
    const regex = /(?:around|at|approx|~|\(|\[|\s|^)(\d{1,2}:\d{2}|\d+(?:\.\d+)?)\s*s(?=\)|\s|\]|$)/gi;

    return text.replace(regex, (match, timeValue) => {
        let seconds = NaN;
        let displayMatch = match.trim(); // Use the captured match (trimmed) for display

        if (timeValue.includes(':')) {
            const parts = timeValue.split(':');
            if (parts.length === 2) {
                const minutes = parseInt(parts[0], 10);
                const secs = parseInt(parts[1], 10);
                if (!isNaN(minutes) && !isNaN(secs)) {
                    seconds = (minutes * 60) + secs;
                }
            }
        } else {
            seconds = parseFloat(timeValue);
        }

        if (!isNaN(seconds)) {
            // Return the span using the modified displayMatch
            return `<span class="clickable-timestamp" data-time="${seconds}" title="Click to play video from ${seconds}s">${displayMatch}</span>`;
        }

        return match; // Return original match if time parsing failed
    });
}

function showVideoPopup(timeInSeconds) {
  if (!currentYoutubeVideoId) {
    console.error("Cannot show video popup: YouTube Video ID is missing.");
    return;
  }
  
  const startTime = Math.floor(timeInSeconds); // YouTube start time needs integer seconds
  const embedUrl = `https://www.youtube.com/embed/${currentYoutubeVideoId}?start=${startTime}&autoplay=1&rel=0`; // Added autoplay=1 and rel=0
  
  console.log(`Showing video popup for ${currentYoutubeVideoId} starting at ${startTime}s`);
  
  youtubePlayer.src = embedUrl;
  videoModal.style.display = 'block';
}

function closeVideoPopup() {
  console.log("Closing video popup");
  youtubePlayer.src = ''; // Clear src to stop playback
  videoModal.style.display = 'none';
}

function resetUI() {
  // Reset state variables
  currentVideoId = null;
  currentYoutubeVideoId = null;
  videoHasFrames = false;
  // Clear chat messages
  chatMessagesEl.innerHTML = '';
  // Hide optional elements
  videoInfoEl.style.display = 'none';
  framesGalleryEl.style.display = 'none';
  framesContainerEl.innerHTML = '';
  chatContainerEl.style.display = 'none';
  closeVideoPopup(); // Ensure popup is closed if open
  // Reset input fields
  youtubeUrlInput.value = '';
  questionInputEl.value = '';
  // Reset status
  processingStatusEl.textContent = 'Processing...';
  processingStatusEl.style.color = 'inherit';
}

function showLoading(show) {
  loadingEl.style.display = show ? 'flex' : 'none';
}

function extractYoutubeVideoId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
} 