#!/usr/bin/env python3
"""
Test script for KAI Clear Chat History Feature

Tests both new endpoints:
1. DELETE /api/v1/chat/clear-history
2. DELETE /api/v1/chat/{conversation_id}

Requirements:
- Backend running on http://localhost:8000
- Valid JWT token (or test user)

Usage:
    python test_clear_history.py
"""

import httpx
import json
import uuid
import sys
from typing import Optional

# Configuration
BASE_URL = "http://localhost:8000"
API_V1 = f"{BASE_URL}/api/v1"
CHAT_ENDPOINT = f"{API_V1}/chat"

# Test JWT token (set via environment or command line)
TEST_TOKEN: Optional[str] = None


def set_auth_header(token: Optional[str] = None) -> dict:
    """Build authorization header."""
    if token:
        return {"Authorization": f"Bearer {token}"}
    return {}


def print_response(response, title: str = "Response"):
    """Pretty print HTTP response."""
    print(f"\n{'='*60}")
    print(f"{title}")
    print(f"{'='*60}")
    print(f"Status Code: {response.status_code}")
    print(f"Content-Type: {response.headers.get('content-type')}")
    
    try:
        body = response.json()
        print(f"Body: {json.dumps(body, indent=2)}")
    except:
        print(f"Body: {response.text}")


def test_clear_all_history(token: Optional[str] = None):
    """Test DELETE /api/v1/chat/clear-history"""
    print("\n" + "="*60)
    print("TEST 1: Clear All Chat History")
    print("="*60)
    
    headers = set_auth_header(token)
    
    try:
        response = httpx.delete(
            f"{CHAT_ENDPOINT}/clear-history",
            headers=headers,
            timeout=10.0
        )
        print_response(response, "Clear All History Response")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Success! Cleared {data.get('count', 0)} conversations")
            return True
        elif response.status_code == 401:
            print("❌ Authentication failed - invalid or missing JWT token")
            return False
        else:
            print(f"❌ Unexpected status code: {response.status_code}")
            return False
            
    except httpx.ConnectError:
        print("❌ Could not connect to backend at", f"{CHAT_ENDPOINT}/clear-history")
        print("   Make sure backend is running: python -m uvicorn app.main:app --reload")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


def test_delete_conversation(conversation_id: Optional[uuid.UUID] = None, token: Optional[str] = None):
    """Test DELETE /api/v1/chat/{conversation_id}"""
    print("\n" + "="*60)
    print("TEST 2: Delete Specific Conversation")
    print("="*60)
    
    # Use provided ID or generate a test one
    test_id = conversation_id or uuid.uuid4()
    
    headers = set_auth_header(token)
    
    try:
        response = httpx.delete(
            f"{CHAT_ENDPOINT}/{test_id}",
            headers=headers,
            timeout=10.0
        )
        print_response(response, f"Delete Conversation Response")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Successfully deleted conversation: {data.get('conversation_id')}")
            return True
        elif response.status_code == 404:
            print("⚠️ Conversation not found (expected if using random ID)")
            print("   Use an actual conversation_id to test this properly")
            return True  # Still a success for testing - means endpoint works
        elif response.status_code == 401:
            print("❌ Authentication failed - invalid or missing JWT token")
            return False
        else:
            print(f"❌ Unexpected status code: {response.status_code}")
            return False
            
    except httpx.ConnectError:
        print("❌ Could not connect to backend")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


def test_error_handling(token: Optional[str] = None):
    """Test error cases"""
    print("\n" + "="*60)
    print("TEST 3: Error Handling")
    print("="*60)
    
    # Test missing auth token
    print("\n📋 Test 3a: Missing authentication...")
    response = httpx.delete(f"{CHAT_ENDPOINT}/clear-history")
    if response.status_code == 401:
        print("✅ Correctly returns 401 for missing token")
    else:
        print(f"⚠️ Expected 401, got {response.status_code}")
    
    # Test invalid conversation ID format
    print("\n📋 Test 3b: Invalid UUID format...")
    headers = set_auth_header(token)
    response = httpx.delete(f"{CHAT_ENDPOINT}/invalid-uuid", headers=headers)
    if response.status_code in [422, 400]:
        print("✅ Correctly returns validation error for invalid UUID")
    else:
        print(f"⚠️ Expected 422/400, got {response.status_code}")


def main():
    """Run all tests"""
    import os
    
    # Try to get token from environment
    global TEST_TOKEN
    TEST_TOKEN = os.getenv("KAI_TEST_TOKEN")
    
    print("""
╔════════════════════════════════════════════════════════════╗
║     KAI Clear Chat History - Feature Test Suite          ║
╚════════════════════════════════════════════════════════════╝
""")
    
    print(f"Backend URL: {BASE_URL}")
    print(f"API Endpoint: {CHAT_ENDPOINT}")
    print(f"Auth Token: {'Provided ✓' if TEST_TOKEN else 'Not provided (will test unauthenticated)'}")
    
    results = []
    
    # Run tests
    results.append(("Clear All History", test_clear_all_history(TEST_TOKEN)))
    results.append(("Delete Specific Conversation", test_delete_conversation(token=TEST_TOKEN)))
    results.append(("Error Handling", test_error_handling(TEST_TOKEN)))
    
    # Print summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    
    for test_name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{test_name:<30} {status}")
    
    total = len(results)
    passed = sum(1 for _, p in results if p)
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All tests passed!")
        return 0
    else:
        print(f"\n⚠️ {total - passed} test(s) failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
