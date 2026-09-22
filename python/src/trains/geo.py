"""Distances, and a coarse index for radius queries.

Both resolving builds need to answer "what is near this city". They ask it of
different things — an article's coordinates, a World Heritage Site, a station, a
mapped feature — so the distance and the indexing live here rather than being
written twice and drifting apart.
"""

from __future__ import annotations

import math
from collections.abc import Iterator


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometres."""
    radius = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = phi2 - phi1
    delta_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    return 2 * radius * math.asin(math.sqrt(a))


class PointGrid:
    """Points bucketed into coarse cells, so a radius query measures only nearby ones.

    The metrics build counts several hundred thousand mapped features for each of
    4,922 cities. Measuring every pair is billions of distance calculations;
    bucketing first leaves only the cells a radius can reach, which is a few
    hundred pairs per city.
    """

    # 0.05 degrees is about 5.6 km of latitude, so a 5 km radius reaches at most
    # two cells away. A cell is narrower in longitude as latitude rises, which
    # only shrinks the candidate set; the distance test rejects whatever the
    # cells over-reach.
    CELL_DEGREES = 0.05

    def __init__(self, points: list[tuple[float, float]]) -> None:
        self._cells: dict[tuple[int, int], list[tuple[float, float, int]]] = {}
        for index, (latitude, longitude) in enumerate(points):
            self._cells.setdefault(self._cell(latitude, longitude), []).append(
                (latitude, longitude, index)
            )

    @classmethod
    def _cell(cls, latitude: float, longitude: float) -> tuple[int, int]:
        return (
            math.floor(latitude / cls.CELL_DEGREES),
            math.floor(longitude / cls.CELL_DEGREES),
        )

    def _neighbours(
        self, latitude: float, longitude: float, radius_km: float
    ) -> Iterator[tuple[float, float, int]]:
        """The indexed points in the cells `radius_km` could reach, and no others."""
        reach = math.ceil(radius_km / (111.0 * self.CELL_DEGREES))
        lat_cell, lon_cell = self._cell(latitude, longitude)
        for lat_offset in range(-reach, reach + 1):
            for lon_offset in range(-reach, reach + 1):
                yield from self._cells.get(
                    (lat_cell + lat_offset, lon_cell + lon_offset), ()
                )

    def count_within(self, latitude: float, longitude: float, radius_km: float) -> int:
        """How many indexed points lie at most `radius_km` from the given point."""
        return sum(
            1
            for point_latitude, point_longitude, _ in self._neighbours(
                latitude, longitude, radius_km
            )
            if haversine_km(latitude, longitude, point_latitude, point_longitude)
            <= radius_km
        )

    def nearest_index(
        self, latitude: float, longitude: float, radius_km: float
    ) -> int | None:
        """The index of the closest point within `radius_km`, or None if none is."""
        best_index: int | None = None
        best_km = radius_km
        for point_latitude, point_longitude, index in self._neighbours(
            latitude, longitude, radius_km
        ):
            distance = haversine_km(
                latitude, longitude, point_latitude, point_longitude
            )
            if distance <= best_km:
                best_index, best_km = index, distance
        return best_index
