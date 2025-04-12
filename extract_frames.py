import os
import sys
import cv2
# Remove pytube import as we'll use yt-dlp
# from pytube import YouTube 
import time
import uuid
import json
import subprocess # Needed to run yt-dlp command

# Helper function to print logs to stderr
def log_stderr(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)

# Function to print the final JSON result to stdout and exit
def exit_with_json(result, exit_code=0):
    print(json.dumps(result, indent=2))
    sys.exit(exit_code)

def download_youtube_video(youtube_url, output_dir):
    """Download a YouTube video using yt-dlp to the specified directory"""
    try:
        log_stderr(f"Attempting to download video from {youtube_url} using yt-dlp")
        
        # Construct the output filename template
        # This tells yt-dlp to save the file as video.mp4 in the output_dir
        output_template = os.path.join(output_dir, "video.mp4")
        
        # yt-dlp command arguments
        # -f bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best: Select best MP4 video/audio, fallback to best MP4, then best overall
        # --merge-output-format mp4: Ensure the final output is MP4 if merging is needed
        # -o output_template: Specify the output path and filename
        # --quiet: Suppress normal yt-dlp output (we handle logging)
        # --progress: Show progress bars (optional, but can be helpful for long downloads)
        # --no-warnings: Suppress yt-dlp warnings
        # --write-info-json: Get video metadata (optional)
        # --print-json: Print final info JSON (contains filepath)
        
        command = [
            'yt-dlp',
            youtube_url,
            '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            '--merge-output-format', 'mp4',
            '-o', output_template,
            '--quiet',
            '--no-warnings',
            # '--progress', # Uncomment for progress bars in stderr
            '--print-json' # Get final info JSON to confirm path
        ]
        
        log_stderr(f"Running yt-dlp command: {' '.join(command)}")
        
        # Execute the command
        process = subprocess.run(command, capture_output=True, text=True, check=False)
        
        # Check for errors during execution
        if process.returncode != 0:
            log_stderr(f"yt-dlp failed with exit code {process.returncode}")
            log_stderr(f"yt-dlp stderr: {process.stderr.strip()}")
            return None # Indicate failure
            
        # yt-dlp execution succeeded, parse the JSON output to get the final path
        try:
            info_json = json.loads(process.stdout)
            # The actual path yt-dlp saved the file to is often in '_filename' or 'filename'
            final_video_path = info_json.get('_filename') or info_json.get('filename')
            
            if final_video_path and os.path.exists(final_video_path):
                log_stderr(f"yt-dlp download successful. Video saved to: {final_video_path}")
                # Ensure the path is absolute, just in case
                return os.path.abspath(final_video_path)
            else:
                log_stderr(f"yt-dlp succeeded but couldn't find the downloaded file path in JSON or on disk.")
                log_stderr(f"yt-dlp stdout: {process.stdout.strip()}")
                # Fallback: check if the expected path exists anyway
                expected_path = os.path.abspath(output_template)
                if os.path.exists(expected_path):
                    log_stderr(f"Found file at expected path: {expected_path}")
                    return expected_path
                else:
                     log_stderr(f"Expected file path {expected_path} not found either.")
                     return None
                     
        except json.JSONDecodeError:
            log_stderr(f"Failed to parse yt-dlp JSON output.")
            log_stderr(f"yt-dlp stdout: {process.stdout.strip()}")
            return None # Indicate failure
        except Exception as json_e:
            log_stderr(f"Error processing yt-dlp JSON output: {str(json_e)}")
            return None # Indicate failure

    except FileNotFoundError:
        log_stderr("Error: yt-dlp command not found. Make sure yt-dlp is installed and in your PATH.")
        return None
    except Exception as e:
        log_stderr(f"Unexpected error during yt-dlp download: {str(e)}")
        log_stderr(f"Exception type: {type(e).__name__}")
        return None # Indicate failure

def extract_frames(video_path, output_folder, interval_seconds=5):
    """Extract frames from video at specified intervals using seeking, include timestamps"""
    extracted_frames_data = [] # Store objects {filename, timestamp}
    cap = None
    try:
        if not os.path.exists(output_folder):
            os.makedirs(output_folder)
        
        log_stderr(f"Attempting to extract frames to {output_folder} from {video_path}")
        
        # Open the video
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            log_stderr(f"Error: Could not open video at {video_path}")
            return [] # Return empty list on failure to open
        
        # Get video properties
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count_total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        log_stderr(f"Video properties - FPS: {fps:.2f}, Total Frames: {frame_count_total}")

        # Handle potential zero FPS or invalid interval
        if fps <= 0 or interval_seconds <= 0:
            log_stderr("Warning: Video FPS is zero or interval invalid. Extracting first frame only.")
            frame_interval = 0 # Special case for first frame
            # max_frames_to_extract = 1 # No need for max frames limit here either
        else:
            # Calculate the number of frames to skip between captures
            frame_interval = int(round(fps * interval_seconds))
            if frame_interval < 1: 
                frame_interval = 1 # Ensure we advance at least one frame
                log_stderr("Warning: Calculated frame interval is less than 1. Setting to 1.")
            # max_frames_to_extract = 20 # REMOVE THE HARDCODED LIMIT

        # log_stderr(f"Frame extraction settings - Interval: {interval_seconds}s, Frame Step: {frame_interval}, Max Frames: {max_frames_to_extract}")
        log_stderr(f"Frame extraction settings - Interval: {interval_seconds}s, Frame Step: {frame_interval}") # Updated log
        
        captured_frame_index = 0
        
        # Loop indefinitely until explicitly broken (e.g., end of video)
        while True: 
            # Calculate the frame number to target
            target_frame_num = captured_frame_index * frame_interval

            # Ensure target frame is within bounds
            if frame_count_total > 0 and target_frame_num >= frame_count_total:
                 log_stderr(f"Target frame {target_frame_num} exceeds total frames {frame_count_total}. Stopping extraction.")
                 break # EXIT LOOP: Reached end of video

            # Calculate the timestamp for the target frame
            target_timestamp_sec = target_frame_num / fps if fps > 0 else 0.0

            cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame_num)
            # Optional: Verify position if possible (may not be accurate)
            # current_pos = cap.get(cv2.CAP_PROP_POS_FRAMES)
            # log_stderr(f"Attempting seek to frame {target_frame_num} (approx {target_timestamp_sec:.2f}s). Current pos: {current_pos}")
            log_stderr(f"Attempting seek to frame {target_frame_num} (approx {target_timestamp_sec:.2f}s)...")
            
            ret, frame = cap.read()
            
            if not ret:
                log_stderr(f"Warning: Failed to read frame near position {target_frame_num}. Stopping.")
                break

            # Frame read successfully, save it
            frame_filename = f"frame_{captured_frame_index+1:03d}.jpg"
            frame_path = os.path.join(output_folder, frame_filename)
            
            if frame is not None and frame.size > 0:
                if cv2.imwrite(frame_path, frame):
                    frame_data = {"filename": frame_filename, "timestamp": round(target_timestamp_sec, 2)}
                    extracted_frames_data.append(frame_data)
                    # log_stderr(f"Saved frame {captured_frame_index+1}/{max_frames_to_extract} (target: {target_frame_num}, time: {target_timestamp_sec:.2f}s): {frame_path}")
                    log_stderr(f"Saved frame {captured_frame_index+1} (target: {target_frame_num}, time: {target_timestamp_sec:.2f}s): {frame_path}") # Updated log
                else:
                    log_stderr(f"Warning: Failed to write frame {captured_frame_index+1} to {frame_path}")
            else:
                log_stderr(f"Skipping invalid frame data encountered after seeking to {target_frame_num}")

            captured_frame_index += 1 # Increment index for the next frame we want
            
            # Optional: Add a safety break if something goes wrong (e.g., too many frames)
            # if captured_frame_index > 1000: # Example safety limit
            #    log_stderr("Warning: Reached safety limit of 1000 frames. Stopping extraction.")
            #    break

        log_stderr(f"Finished extraction loop. Extracted {len(extracted_frames_data)} frames.")
        return extracted_frames_data # Return list of {filename, timestamp} dicts
        
    except Exception as e:
        log_stderr(f"Error during frame extraction: {str(e)}")
        log_stderr(f"Exception type: {type(e).__name__}")
        # Return whatever was extracted before the error
        return extracted_frames_data 
    finally:
        # Ensure video capture resource is always released
        if cap is not None and cap.isOpened():
            cap.release()
            log_stderr("Video capture resource released.")

def process_youtube_video(youtube_url, unique_id):
    """Process a YouTube video and extract frames using a provided unique ID"""
    video_id = unique_id # Use the provided unique ID
    base_dir = os.path.join("public", "frames", video_id)
    temp_dir = os.path.join(base_dir, "temp")

    try:
        # Ensure base and temp directories exist
        os.makedirs(temp_dir, exist_ok=True) 
        log_stderr(f"Ensured directories exist: {base_dir}, {temp_dir}")
        
        # --- Download video ---
        video_path = download_youtube_video(youtube_url, temp_dir)
        if not video_path:
            # Download failed, return error JSON and exit with error code
            exit_with_json({"error": "Failed to download video", "video_id": video_id}, exit_code=1)
        
        # --- Extract frames ---
        frames_data = extract_frames(video_path, base_dir)
        
        # --- Clean up ---
        if os.path.exists(video_path):
            try:
                os.remove(video_path)
                log_stderr(f"Removed temporary video file: {video_path}")
                # Attempt to remove the temp directory if it's empty
                if os.path.exists(temp_dir) and not os.listdir(temp_dir):
                    os.rmdir(temp_dir)
                    log_stderr(f"Removed empty temporary directory: {temp_dir}")
            except OSError as e:
                log_stderr(f"Warning: Error during cleanup: {e}") # Log as warning, not fatal

        # --- Check results ---
        if not frames_data:
            # Frame extraction failed or produced no frames
             exit_with_json({"error": "Failed to extract any frames", "video_id": video_id}, exit_code=1)
        
        # --- Success --- 
        # Create response with frame URLs and timestamps
        frame_results = [
            {
                "url": f"/frames/{video_id}/{data['filename']}", 
                "timestamp": data['timestamp']
            }
            for data in frames_data
        ]

        result = {
            "success": True,
            "video_id": video_id,
            "frame_count": len(frame_results),
            "frames": frame_results # Pass the list of {url, timestamp} objects
        }
        exit_with_json(result, exit_code=0)
    
    except Exception as e:
        log_stderr(f"Unhandled error processing video: {str(e)}")
        log_stderr(f"Exception type: {type(e).__name__}")
        # Generic error, exit with non-zero code
        exit_with_json({"error": f"An unexpected error occurred: {str(e)}", "video_id": video_id}, exit_code=1)

# --- Main execution block ---
if __name__ == "__main__":
    if len(sys.argv) > 2:
        url = sys.argv[1]
        uid = sys.argv[2] # Expect unique_id as the second argument
        process_youtube_video(url, uid) # Function now handles exit
    else:
        # Provide clearer error message for command-line usage
        log_stderr("Usage: python extract_frames.py <youtube_url> <unique_id>")
        exit_with_json({"error": "Missing command-line arguments: youtube_url and unique_id required"}, exit_code=1) 