import asyncio
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from app.llm.groq_client import groq_client
import io

async def test_transcription():
    try:
        # Test basic chat completion first
        print("Testing Groq chat...")
        response = await groq_client.chat_completion(
            messages=[{"role": "user", "content": "Say 'API working'"}],
            max_tokens=10
        )
        print("Chat response:", response.get("content", "No content"))
        
        # Test transcription with dummy audio (will fail but shows if API key works)
        print("\nTesting transcription API...")
        audio_data = b'dummy audio data for testing'
        transcript = await groq_client.transcribe_audio(
            audio_bytes=audio_data,
            filename="test.wav",
            content_type="audio/wav"
        )
        print("Transcript:", transcript)
        
    except Exception as e:
        print(f"Error: {str(e)}")
        print(f"Error type: {type(e).__name__}")

if __name__ == "__main__":
    asyncio.run(test_transcription())
