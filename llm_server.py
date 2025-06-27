import os
import logging
from flask import Flask, request, jsonify
from llama_cpp import Llama
import threading

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()  # Output to console
    ]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
model_instances = {}
model_lock = threading.Lock()

# Configuration
MODEL_PATH = "model/Llama-3.2-1B-Instruct-Q4_0.gguf"
CHAT_FORMAT = "llama-2"  # Note: Verify if this matches Llama-3.2
N_CTX = 512
N_THREADS = 4

def load_model(user_id):
    with model_lock:
        if user_id not in model_instances:
            logger.info(f"Attempting to load model for user {user_id} from {MODEL_PATH}")
            try:
                # Verify model file exists
                if not os.path.exists(MODEL_PATH):
                    logger.error(f"Model file not found at {MODEL_PATH}")
                    raise FileNotFoundError(f"Model file not found at {MODEL_PATH}")
                
                # Verify llama_cpp is properly imported
                if not hasattr(Llama, 'create_chat_completion'):
                    logger.error("llama_cpp Llama class missing create_chat_completion method")
                    raise AttributeError("llama_cpp Llama class is not properly initialized")
                
                logger.debug(f"Initializing Llama model with n_ctx={N_CTX}, n_threads={N_THREADS}")
                model_instances[user_id] = Llama(
                    model_path=MODEL_PATH,
                    chat_format=CHAT_FORMAT,
                    n_ctx=N_CTX,
                    n_threads=N_THREADS
                )
                logger.info(f"Model successfully loaded for user {user_id}, instance ID: {id(model_instances[user_id])}")
            except Exception as e:
                logger.error(f"Failed to load model for user {user_id}: {str(e)}", exc_info=True)
                raise
        else:
            logger.info(f"Model already loaded for user {user_id}, instance ID: {id(model_instances[user_id])}")
        return model_instances[user_id]

@app.route('/init-model/<int:user_id>', methods=['POST'])
def init_model(user_id):
    logger.info(f"Received init-model request for user {user_id}")
    try:
        logger.debug(f"Calling load_model for user {user_id}")
        model = load_model(user_id)
        logger.info(f"Model initialization completed for user {user_id}, model: {model}")
        return jsonify({"status": "success", "message": f"Model initialized for user {user_id}"})
    except Exception as e:
        logger.error(f"Error during init-model for user {user_id}: {str(e)}", exc_info=True)
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/generate/<int:user_id>', methods=['POST'])
def generate_response(user_id):
    logger.info(f"Received generate request for user {user_id}")
    try:
        data = request.get_json()
        logger.debug(f"Request data received: {data}")
        if not data or 'messages' not in data:
            logger.warning("Validation failed: Messages array is required")
            return jsonify({"status": "error", "message": "Messages array is required"}), 400

        messages = data['messages']
        logger.debug(f"Processing messages for user {user_id}: {messages}")
        
        if user_id not in model_instances:
            logger.info(f"No model instance found for user {user_id}, loading now")
            load_model(user_id)
        
        model = model_instances[user_id]
        logger.debug(f"Generating chat completion with model for user {user_id}, model: {model}")
        response = model.create_chat_completion(
            messages=messages,
            max_tokens=100,
            temperature=0.7
        )
        logger.debug(f"Chat completion response raw: {response}")
        content = response['choices'][0]['message']['content']
        logger.info(f"Extracted response content for user {user_id}: {content}")
        
        return jsonify({
            "status": "success",
            "response": content
        })
    except Exception as e:
        logger.error(f"Error during generate for user {user_id}: {str(e)}", exc_info=True)
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    logger.info("Starting LLM server...")
    app.run(host='127.0.0.1', port=5000, debug=True)