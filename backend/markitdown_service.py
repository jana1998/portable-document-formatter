import argparse
import uvicorn
import os
import sys
from pathlib import Path

# Add the services/markitdown-api/src directory to sys.path
api_src_path = Path(__file__).parent.parent / "services" / "markitdown-api" / "src"
sys.path.append(str(api_src_path))

def main():
    parser = argparse.ArgumentParser(description="MarkItDown FastAPI Service Wrapper")
    parser.add_argument("--port", type=int, default=8000, help="Port to run the service on")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host to run the service on")
    args = parser.parse_args()

    # Import the app here to ensure sys.path is updated
    from markitdown_api.app import app
    
    print(f"Starting MarkItDown service on {args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port)

if __name__ == "__main__":
    main()
