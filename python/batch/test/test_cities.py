import sqlite3

import pytest_mock
from langchain import chat_models

from src.cities import cities_table, parse_category_page


def test_parse_category_page() -> None:
    # Given
    category = "Bavaria"

    # When
    pages = parse_category_page(category=category)

    # Then
    assert len(pages) == 111

    assert all(
        item in pages for item in ["Berchtesgaden", "Munich", "Dachau", "Nuremberg"]
    )


def test_empty_page_titles(mocker: pytest_mock.plugin.MockerFixture) -> None:
    # Given
    conn = sqlite3.connect(":memory:")
    mock_gpt_call = mocker.patch("src.langchain_summarize.gpt_summary")
    mock_gpt_call.return_value = "Blah"

    mocker.patch("langchain.chat_models.ChatOpenAI")

    # When
    cities_table(chat_models.ChatOpenAI(), ["Hamburg"], conn, "cities")  # type: ignore

    # Then
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM cities")
    assert cursor.fetchone() == (
        "Hamburg",
        "Blah",
        "https://en.wikivoyage.org/?curid=13965",
    )
