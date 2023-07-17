from src.cities import parse_category_page


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
