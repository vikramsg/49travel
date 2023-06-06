import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card } from 'react-bootstrap';
import { formatDuration, intervalToDuration } from 'date-fns';

import cardsData from '../data/hamburg.json';

const Hamburg = () => {
    const [cards, setCards] = useState(cardsData.cities);
    const [currentPage, setCurrentPage] = useState(30);
    const [showButton, setShowButton] = useState(true);

    useEffect(() => {
        if (currentPage >= cards.length) {
            setShowButton(false);
        } else {
            setShowButton(true);
        }
    }, [currentPage, cards]);

    const handleCardToggle = (index) => {
        setCards((prevCards) =>
            prevCards.map((card, i) => ({
                ...card,
                expanded: i === index ? !card.expanded : card.expanded,
            }))
        );
    };

    const handleShowMore = () => {
        setCurrentPage((prevPage) => prevPage + 30);
    };

    const visibleCards = cards.slice(0, currentPage);

    return (
        <Container className="mt-4">
            <Row xs={1} md={2} lg={2} className="g-4">
                {visibleCards.map((card, index) => (
                    <Col key={card.city}>
                        <Card>
                            <Card.Header>
                                <h5>{card.city}</h5>
                            </Card.Header>
                            <Card.Body>
                                <Card.Text>
                                    Journey time is{' '}
                                    {formatDuration(intervalToDuration({ start: 0, end: card.journey_time * 1000 }))}
                                </Card.Text>
                                {card.expanded && (
                                    <>
                                        <div className="d-grid gap-2">
                                            <a href="https://reiseauskunft.bahn.de/bin/query.exe/dn?protocol=https:" target="_blank" rel="noopener noreferrer">
                                                <button className="btn btn-primary btn-sm">Live Status</button>
                                            </a>
                                        </div>
                                        <Card.Text className="mt-3">{card.description}</Card.Text>
                                        <Card.Text>
                                            Find out more at <a href={card.url}>WikiVoyage</a>.
                                        </Card.Text>
                                    </>
                                )}
                                <div
                                    className={`icon-wrapper ${card.expanded ? 'expanded' : ''}`}
                                    onClick={() => handleCardToggle(index)}
                                >
                                    {card.expanded ? (
                                        <i className="bi bi-caret-up-fill"></i>
                                    ) : (
                                        <i className="bi bi-caret-down-fill"></i>
                                    )}
                                </div>
                            </Card.Body>
                        </Card>
                    </Col>
                ))}
            </Row>
            {showButton && (
                <Row className="mt-4">
                    <Col className="text-center">
                        <button className="btn btn-primary" onClick={handleShowMore}>
                            Show More
                        </button>
                    </Col>
                </Row>
            )}
        </Container>
    );
};



export default Hamburg;