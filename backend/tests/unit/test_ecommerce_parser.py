"""
Unit tests for services/ecommerce/parser.py's tiered extraction — pure, no
network, no I/O.
"""

from __future__ import annotations

from app.services.ecommerce.parser import parse_listing_html

SOURCE = "https://shop.example.com/products/widget"


def test_json_ld_product_parsed():
    html = f"""
    <html><head>
    <script type="application/ld+json">
    {{"@type": "Product", "name": "Widget", "description": "A fine widget",
      "image": ["/images/widget.jpg", "https://cdn.example.com/widget2.jpg"]}}
    </script>
    </head><body></body></html>
    """
    result = parse_listing_html(html, SOURCE)
    assert result.parse_method == "json_ld"
    assert result.title == "Widget"
    assert result.description == "A fine widget"
    assert [img.url for img in result.images] == [
        "https://shop.example.com/images/widget.jpg",
        "https://cdn.example.com/widget2.jpg",
    ]


def test_json_ld_graph_wrapped_product_parsed():
    html = f"""
    <html><head>
    <script type="application/ld+json">
    {{"@graph": [
        {{"@type": "BreadcrumbList"}},
        {{"@type": "Product", "name": "Graph Widget", "image": "https://cdn.example.com/g.jpg"}}
    ]}}
    </script>
    </head><body></body></html>
    """
    result = parse_listing_html(html, SOURCE)
    assert result.parse_method == "json_ld"
    assert result.title == "Graph Widget"


def test_malformed_json_ld_does_not_crash_and_falls_through():
    html = """
    <html><head>
    <script type="application/ld+json">{ this is not valid json </script>
    <meta property="og:title" content="Fallback Title">
    <meta property="og:image" content="https://cdn.example.com/og.jpg">
    </head><body></body></html>
    """
    result = parse_listing_html(html, SOURCE)
    assert result.parse_method == "opengraph"
    assert result.title == "Fallback Title"


def test_open_graph_all_image_tags_collected():
    html = """
    <html><head>
    <meta property="og:title" content="OG Product">
    <meta property="og:description" content="OG description">
    <meta property="og:image" content="/img/1.jpg">
    <meta property="og:image" content="/img/2.jpg">
    </head><body></body></html>
    """
    result = parse_listing_html(html, SOURCE)
    assert result.parse_method == "opengraph"
    assert len(result.images) == 2
    assert result.images[0].url == "https://shop.example.com/img/1.jpg"


def test_img_tag_fallback_when_no_structured_markup():
    html = """
    <html><head><title>Plain Page</title></head>
    <body>
      <img src="data:image/png;base64,abc" />
      <img src="/icons/logo.svg" />
      <img src="/images/product-photo.jpg" alt="Product">
    </body></html>
    """
    result = parse_listing_html(html, SOURCE)
    assert result.parse_method == "img_fallback"
    assert result.title == "Plain Page"
    assert [img.url for img in result.images] == ["https://shop.example.com/images/product-photo.jpg"]
    assert result.images[0].alt == "Product"
    assert result.warnings


def test_no_data_at_all_returns_none_parse_method():
    html = "<html><head></head><body><p>Nothing here.</p></body></html>"
    result = parse_listing_html(html, SOURCE)
    assert result.parse_method == "none"
    assert result.images == []
    assert result.warnings
