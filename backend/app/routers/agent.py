import datetime
import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from ..database import get_db
from ..deps import get_current_user, require_board_access
from ..websockets import notify

import httpx
from openai import OpenAI

router = APIRouter(prefix="/api/boards/{board_id}/agent", tags=["agent"])


class AIExtractedCard(BaseModel):
    title: str
    description: str = ""
    list_id: int
    labels: str = ""
    due_date_iso: Optional[str] = None


class AIAgentResponseWrapper(BaseModel):
    is_setup_request: bool = False
    extracted_cards: List[AIExtractedCard] = []
    agent_message: str = ""


@router.post("/create-card")
def agent_auto_create_card(
        board_id: int,
        payload: schemas.AgentPromptRequest,
        db: Session = Depends(get_db),
        user: models.User = Depends(get_current_user),
):
    require_board_access(board_id, db, user)

    if not settings.openai_api_key:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="OpenAI API key is missing. Add OPENAI_API_KEY to your environment."
        )

    board_lists = db.query(models.List).filter_by(board_id=board_id).order_by(models.List.position).all()
    today_date = datetime.date.today().isoformat()

    user_prompt_lower = payload.prompt.lower()
    if not board_lists:
        if any(keyword in user_prompt_lower for keyword in
               ["yes", "setup", "initialize", "ok", "sure", "create lists"]):
            default_names = ["Todo", "In Progress", "Done"]
            created_lists = []
            for idx, name in enumerate(default_names):
                new_list = models.List(name=name, board_id=board_id, position=idx + 1)
                db.add(new_list)
                db.flush()
                created_lists.append(new_list)

            # Log the AI Setup Action
            setup_log = models.ActivityLog(
                board_id=board_id,
                user_email="AI Agent",
                action_text="automatically initialized standard layout columns (Todo, In Progress, Done)"
            )
            db.add(setup_log)
            db.commit()

            for lst in created_lists:
                notify(board_id, {"type": "list_created", "list_id": lst.id, "refresh_logs": True})

            return {
                "status": "setup_completed",
                "message": "I have successfully initialized this board layout with standard columns: Todo, In Progress, and Done! You can now ask me to drop tasks into them.",
                "cards_created": []
            }
        else:
            return {
                "status": "empty_board_warning",
                "message": "I see this board layout is completely empty! Would you like me to initialize it with standard columns (Todo, In Progress, Done) for you? Just say 'Yes' or 'Setup columns'.",
                "cards_created": []
            }

    lists_context = [{"id": l.id, "name": l.name} for l in board_lists]

    system_instruction = f"""
    You are an advanced project planning coordinator for Stack Board.
    Your objective is to split the user's natural language thoughts into one or more task cards.

    Current Calendar Date: Today is {today_date}.
    Target Lists Available on this Board layout: {lists_context}

    Rules:
    - Parse out EVERY task mentioned in the user's prompt. If they ask for multiple distinct items, extract them as separate cards inside the `extracted_cards` list loop.
    - Match tasks to appropriate destination lists based on the names given. If unmentioned, default to list ID: {lists_context[0]['id']}.
    - Compute exact calendar metrics (YYYY-MM-DD) for terms like 'tomorrow' or 'next week' relative to today ({today_date}).
    - Summarize what you did clearly in the `agent_message` field.

    Return your response strictly as a JSON object matching this schema:
    {{
       "is_setup_request": false,
       "agent_message": "Summary explanation text detailing what cards were compiled",
       "extracted_cards": [
          {{
             "title": "Task summary title",
             "description": "Task description details or empty string",
             "list_id": integer_list_id,
             "labels": "comma-separated labels or empty string",
             "due_date_iso": "YYYY-MM-DD string or null"
          }}
       ]
    }}
    """

    try:
        http_client = httpx.Client()
        openai_client = OpenAI(api_key=settings.openai_api_key, http_client=http_client)

        completion = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": payload.prompt}
            ],
            response_format={"type": "json_object"}
        )

        parsed_data = json.loads(completion.choices[0].message.content)
        extracted_wrapper = AIAgentResponseWrapper(**parsed_data)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to communicate or parse with AI model engine: {str(e)}"
        )

    response_cards = []
    valid_list_ids = [l["id"] for l in lists_context]

    for raw_card in extracted_wrapper.extracted_cards:
        # Resolve target list metadata for the log string context
        matched_list = next((l for l in board_lists if l.id == raw_card.list_id), board_lists[0])
        target_list_id = matched_list.id

        final_due_date = None
        if raw_card.due_date_iso:
            try:
                final_due_date = datetime.datetime.strptime(raw_card.due_date_iso, "%Y-%m-%d")
            except ValueError:
                pass

        max_pos = db.query(func.max(models.Card.position)).filter_by(list_id=target_list_id).scalar()

        card_model = models.Card(
            title=raw_card.title,
            description=raw_card.description,
            due_date=final_due_date,
            labels=raw_card.labels,
            list_id=target_list_id,
            position=(max_pos or 0) + 1,
            completed=1 if matched_list.name.lower() == "done" else 0,  # Auto-flag if dropped in Done
            reminder_sent=0
        )
        db.add(card_model)
        db.flush()

        # Log the card generated by the AI
        card_log = models.ActivityLog(
            board_id=board_id,
            user_email="AI Agent",
            action_text=f"generated card '{raw_card.title}' inside column '{matched_list.name}' via prompt request"
        )
        db.add(card_log)

        response_cards.append({
            "id": card_model.id,
            "title": card_model.title,
            "list_id": card_model.list_id
        })

        notify(board_id,
               {"type": "card_created", "card_id": card_model.id, "list_id": target_list_id, "refresh_logs": True})

    db.commit()

    return {
        "status": "success",
        "message": extracted_wrapper.agent_message,
        "cards_created": response_cards
    }