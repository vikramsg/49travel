import queue
import re
import sqlite3
from typing import Dict, List

import requests
from langchain.chat_models import ChatOpenAI

from src.common import city_table_connection
from src.langchain_summarize import _get_llm, gpt_summary
from src.model import WikiCategoryResponse, WikiPageResponse

_WIKIVOYAGE_URL = "https://en.wikivoyage.org/w/api.php"


def _category_query_params(category: str) -> Dict:
    return {
        "action": "query",
        "format": "json",
        "list": "categorymembers",
        "cmtitle": category,
        "cmlimit": 500,
    }


def _page_query_params(page_title: str) -> Dict:
    return {
        "action": "query",
        "format": "json",
        "titles": page_title,
        "prop": "extracts",
        "explaintext": True,
        "inprop": "url",
    }


def _create_url_from_page_id(page_id: int) -> str:
    return f"https://en.wikivoyage.org/?curid={page_id}"


def parse_category_page() -> List[str]:
    """
    Create a queue that goes down all subcategories of the Germany category
    Process the queue to get all pages within all subcategories
    """
    categories = queue.Queue()  # type: ignore
    categories.put("Category:Germany")

    pages = []

    category_counter: int = 0
    while not categories.empty():
        category = categories.get()

        response = requests.get(_WIKIVOYAGE_URL, params=_category_query_params(category))  # type: ignore
        response_data = WikiCategoryResponse.parse_obj(response.json())
        for member in response_data.query.categorymembers:
            if member.ns == 14:
                categories.put(member.title)
            if member.ns == 0:
                pages.append(member.title)

        category_counter += 1
        print(f"Processed {category_counter} categories")

    return pages


def _insert_city_description_in_table(
    llm: ChatOpenAI, cursor: sqlite3.Cursor, city: str, table_name: str
) -> None:
    content_response = requests.get(_WIKIVOYAGE_URL, params=_page_query_params(city))
    page_content = WikiPageResponse.parse_obj(content_response.json())

    # Extract the page content
    for _, page_info in page_content.query.pages.items():
        city = page_info.title
        page_extract = page_info.extract

        is_city = not re.search("== Regions ==", page_extract)
        if is_city:
            cursor.execute(f"SELECT city FROM {table_name} WHERE city='{city}'")
            is_city_not_present = cursor.fetchone() is None

            if is_city_not_present:
                print(f"Getting city summary for {city}.")
                city_description = gpt_summary(llm, page_extract, city)

                print(f"Writing info for {city} city.")
                cursor.execute(
                    f"INSERT INTO {table_name} (city, description, url) VALUES (?, ?, ?)",
                    (
                        city,
                        city_description,
                        _create_url_from_page_id(page_info.pageid),
                    ),
                )


def cities_table(
    llm: ChatOpenAI,
    page_titles: List[str],
    conn: sqlite3.Connection,
    table_name: str,
) -> None:
    """
    We want city description. To start with we were doing
    crude regex which was not very good. Then we tried using
    Pythia but summaries were pretty bad. So finally, we moved
    over to ChatGPT
    """

    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {table_name}(
            city TEXT,
            description TEXT,
            url TEXT
        )
    """
    )

    cursor = conn.cursor()

    for city in page_titles:
        _insert_city_description_in_table(llm, cursor, city, table_name)
        conn.commit()

    conn.close()


if __name__ == "__main__":
    # Get all pages under the category Germany
    pages = parse_category_page()

    # Add city descriptions using ChatGPT
    llm = _get_llm()
    conn = city_table_connection()
    cities_table(llm, pages, conn, table_name="cities")
