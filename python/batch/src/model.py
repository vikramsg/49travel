from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, validator


class Location(BaseModel):
    type: str
    id: str
    latitude: float
    longitude: float


class Products(BaseModel):
    nationalExpress: bool
    national: bool
    regionalExpress: bool
    regional: bool
    suburban: bool
    bus: bool
    ferry: bool
    subway: bool
    tram: bool
    taxi: bool


class Stop(BaseModel):
    type: str
    id: int
    name: str
    location: Location
    products: Products


class Operator(BaseModel):
    type: str
    id: str
    name: str


class Line(BaseModel):
    type: str
    id: str
    fahrtNr: str
    name: str
    public: bool
    adminCode: str
    productName: str
    mode: str
    product: str
    operator: Optional[Operator]
    additionalName: Optional[str]


class Destination(BaseModel):
    type: str
    id: int
    name: str
    location: Location
    products: Products


class Departure(BaseModel):
    tripId: str
    stop: Stop
    when: str
    plannedWhen: str
    delay: Optional[str]
    platform: str
    plannedPlatform: str
    prognosisType: Optional[str]
    direction: str
    provenance: Optional[str]
    line: Line
    remarks: List[str]
    origin: Optional[str]
    destination: Destination


class Stopover(BaseModel):
    stop: Stop
    arrival: Optional[str]
    plannedArrival: Optional[str]
    arrivalDelay: Optional[str]
    arrivalPlatform: Optional[str]
    arrivalPrognosisType: Optional[str]
    plannedArrivalPlatform: Optional[str]
    departure: Optional[str]
    plannedDeparture: Optional[str]
    departureDelay: Optional[str]
    departurePlatform: Optional[str]
    departurePrognosisType: Optional[str]
    plannedDeparturePlatform: Optional[str]


class Trip(BaseModel):
    origin: Stop
    destination: Stop
    departure: str
    plannedDeparture: datetime
    departureDelay: Optional[str]
    arrival: str
    plannedArrival: datetime
    arrivalDelay: Optional[str]
    line: Line
    direction: str
    arrivalPlatform: str
    plannedArrivalPlatform: str
    arrivalPrognosisType: str
    departurePlatform: str
    plannedDeparturePlatform: str
    departurePrognosisType: str
    stopovers: List[Stopover]


class TripResponseModel(BaseModel):
    trip: Trip


class TripDepartureArrival(BaseModel):
    departure: datetime
    arrival: datetime


class StopDeparturesResponseModel(BaseModel):
    departures: List[Departure]
    realtimeDataUpdatedAt: Optional[int]


class TravelRoute(BaseModel):
    origin: str
    destination: str
    train_line: str
    origin_id: int
    destination_id: int
    departure: datetime
    arrival: datetime

    def __hash__(self) -> int:
        # Override hash to consider only origin and destination fields
        return hash((self.origin, self.destination))

    def __eq__(self, other: Any) -> bool:
        # Override equality to consider only origin and destination fields
        if isinstance(other, TravelRoute):
            return self.origin == other.origin and self.destination == other.destination
        return False


class Leg(BaseModel):
    origin: Stop
    destination: Stop
    departure: str
    plannedDeparture: str
    departureDelay: Optional[str]
    arrival: str
    plannedArrival: str
    arrivalDelay: Optional[str]
    reachable: Optional[bool]
    tripId: Optional[str]
    line: Optional[Line]
    direction: Optional[str]
    arrivalPlatform: Optional[str]
    plannedArrivalPlatform: Optional[str]
    arrivalPrognosisType: Optional[str]
    departurePlatform: Optional[str]
    plannedDeparturePlatform: Optional[str]
    departurePrognosisType: Optional[str]


class Journey(BaseModel):
    type: str
    legs: List[Leg]


class JourneyResponse(BaseModel):
    realTimeDataUpdatedAt: Optional[int]
    earlierRef: Optional[str]
    laterRef: Optional[str]
    journeys: Optional[List[Journey]]
    refreshToken: Optional[str]
    price: Optional[str]

    @validator("journeys")
    def remove_flx_or_none_line(cls, journeys: List[Journey]) -> List[Journey]:
        if journeys:
            updated_journeys = []
            for journey in journeys:
                flag = 1
                for leg in journey.legs:
                    if not leg.line or leg.line.productName == "FLX":
                        flag = 0
                if flag:
                    updated_journeys.append(journey)

            return updated_journeys
        else:
            return journeys


class WikiCategoryMember(BaseModel):
    pageid: int
    ns: int  # 14: subcategories 0: page
    title: str


class WikiQuery(BaseModel):
    categorymembers: List[WikiCategoryMember]


class WikiCategoryResponse(BaseModel):
    batchcomplete: str
    query: WikiQuery


class Page(BaseModel):
    pageid: int
    title: str
    extract: str


class WikiPageQuery(BaseModel):
    pages: Dict[str, Page]


class WikiPageResponse(BaseModel):
    batchcomplete: str
    query: WikiPageQuery


class JourneySummary(BaseModel):
    journey_time: timedelta
    journey_info: List[List[Tuple[str, str, str, str, Optional[str]]]]
