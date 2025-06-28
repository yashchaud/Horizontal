import React from "react";
import Friendstab from "@images/Friendsecond.svg";
import styled from "styled-components";
import { useDispatch } from "react-redux";
import {
  setaddfriend,
  setuserlist,
  setSearchFilterForUseronline,
} from "@Redux/sessionSlice";
import { useSelector } from "react-redux";
import HamburgerIcon from "@images/hamburgeronline.svg";
import { Separator } from "@ui/separator";
import { useQueryClient } from "@tanstack/react-query";
import { setFriendTabFlag, settogglesidebar } from "@/Redux/sessionSlice";

const Navfriend = () => {
  const dispatch = useDispatch();
  const { SearchFilterForUseronline } = useSelector(
    (state) => state.counterSlice
  );
  return (
    <Cover className="p-4">
      <div className="Iconfriend">
        <img
          src={HamburgerIcon}
          onClick={() => {
            dispatch(setFriendTabFlag(false));
            dispatch(settogglesidebar(true));
          }}
          className="mr-2 hidden max-lg:block cursor-pointer"
          alt=""
        />
        <img src={Friendstab} alt="" />
        <p>Friends</p>
      </div>

      <Separator
        orientation="vertical"
        className="bg-[#5d5d5d] ml-9 h-[1.5rem] w-[0.5px]"
      />
      <div className="Filterbutton">
        <button
          className={
            SearchFilterForUseronline === "online" ? "active" : "nonactive"
          }
          onClick={() => {
            dispatch(setaddfriend(false));
            dispatch(setuserlist(true));
            dispatch(setSearchFilterForUseronline("online"));
          }}
        >
          Online
        </button>
        <button
          className={
            SearchFilterForUseronline === "all" ? "active" : "nonactive"
          }
          onClick={() => {
            dispatch(setaddfriend(false));
            dispatch(setuserlist(true));
            dispatch(setSearchFilterForUseronline("all"));
          }}
        >
          All
        </button>
        <button
          className={
            SearchFilterForUseronline === "pending" ? "active" : "nonactive"
          }
          onClick={() => {
            dispatch(setaddfriend(false));
            dispatch(setuserlist(true));
            dispatch(setSearchFilterForUseronline("pending"));
          }}
        >
          Pending
        </button>
        <button
          className={
            SearchFilterForUseronline === "blocked" ? "active" : "nonactive"
          }
          onClick={() => {
            dispatch(setaddfriend(false));
            dispatch(setuserlist(true));
            dispatch(setSearchFilterForUseronline("blocked"));
          }}
        >
          Blocked
        </button>
        <button
          className={
            SearchFilterForUseronline === "addfriend"
              ? "active Addfriend"
              : "nonactive Addfriend"
          }
          onClick={() => {
            dispatch(setaddfriend(true));
            dispatch(setuserlist(false));
          }}
        >
          Add Friend
        </button>
      </div>
    </Cover>
  );
};

export default Navfriend;

const Cover = styled.div`
  width: 100%;
  height: 3.5rem;
  background-color: #313338;
  border-bottom: 2px solid #1f2023;
  display: flex;
  gap: 0.5rem;
  align-items: center;
  @media (max-width: 1024px) {
    overflow-x: auto;
  }
  .active {
    background-color: #42444a;
  }
  .Iconfriend {
    width: 7rem;
    padding: 1rem;
    padding-top: 0.8rem;
    display: flex;
    gap: 0.5rem;
    align-items: center;
    color: white;
    display: flex;
    align-items: center;
    p {
      font-weight: 800;
    }
    img {
      min-width: 1.5rem;
    }
  }
  .Seperator {
    background-color: #3e4047;
    width: 0.5px;
    height: 1.5rem;
  }
  .Filterbutton {
    margin-left: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    button {
      border: none;
      outline: none;
      color: white;
      font-weight: 500;
      letter-spacing: 0.7px;
      font-size: 0.9rem;
      border-radius: 0.2rem;
      padding-inline: 0.5rem;
    }
    .Addfriend {
      background-color: #248046;
      border-radius: 0.2rem;
      padding: 0.2rem;
      padding-inline: 0.5rem;
      min-width: 7rem;
    }
  }
`;
